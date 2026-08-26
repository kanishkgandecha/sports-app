import { Prisma, prisma } from "@sports/db";
import type { Player, Team } from "@sports/domain";
import type { DriverTimingPatch, OpenF1HistoricalSessionDetail } from "@sports/providers-f1-openf1";
import { toPitStopRow, toRaceControlMessageRow } from "../../f1/currentState";

const CURSOR_PROVIDER = "openf1-history-detail-v1";

export interface F1DetailProvider {
  id: "openf1";
  getHistoricalSessionDetail(sessionId: string): Promise<OpenF1HistoricalSessionDetail>;
}

export interface F1DetailImportOptions {
  year: number;
  limit: number;
  fixtureId?: string;
  sessionTypes?: string[] | "ALL";
  retryUnavailable?: boolean;
  retryFailed?: boolean;
  refreshAnalysis?: boolean;
  dryRun?: boolean;
  now?: Date;
}

interface DetailSession {
  id: string;
  fixtureId: string;
  type: string;
  status: string;
  endTime: Date | null;
  dataProfile?: { status: string; nextRetryAt: Date | null } | null;
}

export function selectCompletedDetailSessions(
  sessions: DetailSession[],
  sessionTypes: string[] | "ALL",
  now: Date,
): DetailSession[] {
  const allowed = sessionTypes === "ALL" ? null : new Set(sessionTypes);
  return sessions.filter(
    (session) =>
      (!allowed || allowed.has(session.type)) &&
      (session.status === "completed" || (session.endTime !== null && session.endTime <= now)),
  );
}

export async function importF1Details(provider: F1DetailProvider, options: F1DetailImportOptions) {
  if (provider.id !== "openf1") throw new Error("F1 event-data history requires OpenF1");
  if (!Number.isInteger(options.year) || options.year < 2023 || options.year > new Date().getUTCFullYear())
    throw new Error("detail year must be from 2023 through the current year");
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 30)
    throw new Error("limit must be from 1 to 30");

  const sessionTypes = options.sessionTypes ?? "ALL";
  const now = options.now ?? new Date();
  const fixtures = await prisma.fixture.findMany({
    where: {
      sport: { slug: "f1" },
      season: { label: String(options.year) },
      dataProfile: { is: { source: "openf1" } },
      ...(options.fixtureId ? { id: options.fixtureId } : {}),
    },
    orderBy: [{ startTime: "asc" }, { id: "asc" }],
    take: options.limit,
    select: {
      id: true,
      sessions: {
        orderBy: [{ startTime: "asc" }, { id: "asc" }],
        select: {
          id: true,
          fixtureId: true,
          type: true,
          status: true,
          endTime: true,
          dataProfile: { select: { status: true, nextRetryAt: true } },
        },
      },
    },
  });
  const targets = fixtures.flatMap((fixture) => selectCompletedDetailSessions(fixture.sessions, sessionTypes, now));
  if (options.dryRun)
    return {
      runId: null,
      year: options.year,
      matched: targets.length,
      imported: 0,
      skipped: targets.length,
      failed: 0,
      unavailable: 0,
    };

  const typeKey = sessionTypes === "ALL" ? "all" : [...sessionTypes].sort().join(",").toLowerCase();
  const scopeKey = `${options.year}:${options.limit}:event-data:${typeKey}:${options.fixtureId ?? "all-fixtures"}`;
  const run = await prisma.historicalImport.upsert({
    where: { source_scopeKey: { source: "openf1-detail", scopeKey } },
    update: {
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      error: null,
    },
    create: {
      sportSlug: "f1",
      source: "openf1-detail",
      scopeKey,
      status: "running",
      metadata: { year: options.year, limit: options.limit, fixtureId: options.fixtureId ?? null, sessionTypes },
    },
  });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let unavailable = 0;
  const errors: string[] = [];
  for (const session of targets) {
    if (session.dataProfile?.status === "upstream-unavailable" && !options.retryUnavailable) {
      unavailable += 1;
      skipped += 1;
      continue;
    }
    if (
      (session.dataProfile?.status === "available" && !options.refreshAnalysis) ||
      (session.dataProfile?.status === "failed" &&
        !options.retryFailed &&
        session.dataProfile.nextRetryAt &&
        session.dataProfile.nextRetryAt > now)
    ) {
      skipped += 1;
      continue;
    }
    const cursor = await prisma.providerCursor.findUnique({
      where: { providerId_sessionId: { providerId: CURSOR_PROVIDER, sessionId: session.id } },
    });
    if (cursor?.cursor === "complete" && !options.refreshAnalysis) {
      await markSessionAvailable(session.id, now);
      skipped += 1;
      continue;
    }
    try {
      await prisma.sessionDataProfile.upsert({
        where: { sessionId: session.id },
        update: {
          source: provider.id,
          status: "importing",
          reason: null,
          attemptCount: { increment: 1 },
          lastAttemptAt: now,
          nextRetryAt: null,
        },
        create: {
          sessionId: session.id,
          source: provider.id,
          status: "importing",
          attemptCount: 1,
          lastAttemptAt: now,
        },
      });
      const detail = await provider.getHistoricalSessionDetail(session.id);
      if (
        detail.timingPatches.length === 0 &&
        detail.events.length === 0 &&
        detail.classifications.length === 0 &&
        detail.laps.length === 0 &&
        detail.stints.length === 0
      ) {
        await prisma.sessionDataProfile.update({
          where: { sessionId: session.id },
          data: {
            status: "upstream-unavailable",
            reason: "OpenF1 has no historical event data for this completed session.",
            nextRetryAt: null,
          },
        });
        await refreshFixtureCoverage(session.fixtureId);
        unavailable += 1;
        skipped += 1;
        continue;
      }
      await persistSessionDetail(session.fixtureId, session.id, detail);
      imported += 1;
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      const message = `${session.id}: ${reason}`;
      errors.push(message);
      await prisma.sessionDataProfile.upsert({
        where: { sessionId: session.id },
        update: { status: "failed", reason: reason.slice(0, 1_000), nextRetryAt: retryAt(now) },
        create: {
          sessionId: session.id,
          source: provider.id,
          status: "failed",
          reason: reason.slice(0, 1_000),
          attemptCount: 1,
          lastAttemptAt: now,
          nextRetryAt: retryAt(now),
        },
      });
      await refreshFixtureCoverage(session.fixtureId);
      console.error(`[f1-detail] ${message}`);
    }
  }

  await prisma.historicalImport.update({
    where: { id: run.id },
    data: {
      status: failed > 0 ? "failed" : "completed",
      completedAt: new Date(),
      importedCount: imported,
      skippedCount: skipped,
      failedCount: failed,
      error: errors.length > 0 ? errors.join("\n").slice(0, 2_000) : null,
      metadata: {
        year: options.year,
        limit: options.limit,
        fixtureId: options.fixtureId ?? null,
        sessionTypes,
        unavailable,
      },
    },
  });
  return { runId: run.id, year: options.year, matched: targets.length, imported, skipped, failed, unavailable };
}

async function persistSessionDetail(
  fixtureId: string,
  sessionId: string,
  detail: OpenF1HistoricalSessionDetail,
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const sport = await tx.sport.findUniqueOrThrow({ where: { slug: "f1" }, select: { id: true } });
      await persistRoster(tx, sport.id, detail.teams, detail.players);
      for (const events of chunks(detail.events, 500)) {
        await tx.liveEvent.createMany({
          data: events.map((event) => ({
            id: event.id,
            sportId: sport.id,
            sessionId: event.sessionId,
            eventType: event.eventType,
            timestamp: new Date(event.timestamp),
            source: event.source,
            payload: event.payload as Prisma.InputJsonValue,
          })),
          skipDuplicates: true,
        });
      }
      const raceControl = detail.events.map(toRaceControlMessageRow).filter((row) => row !== null);
      await tx.raceControlMessage.createMany({
        data: raceControl.map((row) => ({ ...row, timestamp: new Date(row.timestamp) })),
        skipDuplicates: true,
      });
      const pitStops = detail.events.map(toPitStopRow).filter((row) => row !== null);
      await tx.pitStop.createMany({
        data: pitStops.map((row) => ({ ...row, timestamp: new Date(row.timestamp) })),
        skipDuplicates: true,
      });
      for (const patch of detail.timingPatches) await upsertTiming(tx, patch);
      await tx.sessionClassification.deleteMany({ where: { sessionId } });
      await tx.lap.deleteMany({ where: { sessionId } });
      await tx.tyreStint.deleteMany({ where: { sessionId } });
      await tx.sessionClassification.createMany({ data: detail.classifications });
      for (const laps of chunks(detail.laps, 1_000)) {
        await tx.lap.createMany({
          data: laps.map((lap) => ({ ...lap, startedAt: lap.startedAt ? new Date(lap.startedAt) : null })),
        });
      }
      await tx.tyreStint.createMany({ data: detail.stints });
      await tx.sessionDataProfile.update({
        where: { sessionId },
        data: { status: "available", reason: null, nextRetryAt: null, importedAt: new Date() },
      });
      await tx.providerCursor.upsert({
        where: { providerId_sessionId: { providerId: CURSOR_PROVIDER, sessionId } },
        update: { cursor: "complete" },
        create: { providerId: CURSOR_PROVIDER, sessionId, cursor: "complete" },
      });
    },
    { timeout: 120_000 },
  );
  await refreshFixtureCoverage(fixtureId);
}

async function markSessionAvailable(sessionId: string, now: Date) {
  await prisma.sessionDataProfile.upsert({
    where: { sessionId },
    update: { status: "available", reason: null, nextRetryAt: null, importedAt: now },
    create: {
      sessionId,
      source: "openf1",
      status: "available",
      attemptCount: 1,
      lastAttemptAt: now,
      importedAt: now,
    },
  });
}

async function refreshFixtureCoverage(fixtureId: string) {
  const sessions = await prisma.session.findMany({
    where: { fixtureId, OR: [{ status: "completed" }, { endTime: { lte: new Date() } }] },
    select: { dataProfile: { select: { status: true } } },
  });
  const available = sessions.filter((session) => session.dataProfile?.status === "available").length;
  const coverage = available === 0 ? "summary" : available === sessions.length ? "event-data" : "partial";
  await prisma.fixtureDataProfile.update({ where: { fixtureId }, data: { coverage, importedAt: new Date() } });
}

function retryAt(now: Date) {
  return new Date(now.getTime() + 6 * 60 * 60 * 1_000);
}

async function persistRoster(tx: Prisma.TransactionClient, sportId: string, teams: Team[], players: Player[]) {
  for (const team of teams) {
    await tx.team.upsert({
      where: { id: team.id },
      update: { name: team.name, colorHex: team.colorHex },
      create: { ...team, sportId },
    });
  }
  for (const player of players) {
    await tx.player.upsert({
      where: { id: player.id },
      update: {
        teamId: player.teamId,
        name: player.name,
        role: player.role,
        shortName: player.shortName,
        avatarUrl: player.avatarUrl,
      },
      create: { ...player, sportId },
    });
  }
}

async function upsertTiming(tx: Prisma.TransactionClient, patch: DriverTimingPatch) {
  await tx.driverTiming.upsert({
    where: { sessionId_driverId: { sessionId: patch.sessionId, driverId: patch.driverId } },
    update: timingData(patch),
    create: {
      sessionId: patch.sessionId,
      driverId: patch.driverId,
      position: patch.position ?? 0,
      gapToLeader: patch.gapToLeader ?? null,
      intervalToAhead: patch.intervalToAhead ?? null,
      lastLapTime: patch.lastLapTime ?? null,
      bestLapTime: patch.bestLapTime ?? null,
      sector1: patch.sector1 ?? null,
      sector2: patch.sector2 ?? null,
      sector3: patch.sector3 ?? null,
      tyreCompound: patch.tyreCompound ?? null,
      state: patch.state ?? "running",
    },
  });
}

function timingData(patch: DriverTimingPatch) {
  return {
    ...(patch.position !== undefined && { position: patch.position }),
    ...(patch.gapToLeader !== undefined && { gapToLeader: patch.gapToLeader }),
    ...(patch.intervalToAhead !== undefined && { intervalToAhead: patch.intervalToAhead }),
    ...(patch.lastLapTime !== undefined && { lastLapTime: patch.lastLapTime }),
    ...(patch.bestLapTime !== undefined && { bestLapTime: patch.bestLapTime }),
    ...(patch.sector1 !== undefined && { sector1: patch.sector1 }),
    ...(patch.sector2 !== undefined && { sector2: patch.sector2 }),
    ...(patch.sector3 !== undefined && { sector3: patch.sector3 }),
    ...(patch.tyreCompound !== undefined && { tyreCompound: patch.tyreCompound }),
    ...(patch.state !== undefined && { state: patch.state }),
  };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
