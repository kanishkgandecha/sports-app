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
  dryRun?: boolean;
  now?: Date;
}

interface DetailSession {
  id: string;
  fixtureId: string;
  type: string;
  status: string;
  endTime: Date | null;
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

  const sessionTypes = options.sessionTypes ?? ["RACE"];
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
        select: { id: true, fixtureId: true, type: true, status: true, endTime: true },
      },
    },
  });
  const targets = fixtures.flatMap((fixture) =>
    selectCompletedDetailSessions(fixture.sessions, sessionTypes, options.now ?? new Date()),
  );
  if (options.dryRun)
    return {
      runId: null,
      year: options.year,
      matched: targets.length,
      imported: 0,
      skipped: targets.length,
      failed: 0,
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
  const errors: string[] = [];
  for (const session of targets) {
    const cursor = await prisma.providerCursor.findUnique({
      where: { providerId_sessionId: { providerId: CURSOR_PROVIDER, sessionId: session.id } },
    });
    if (cursor?.cursor === "complete") {
      skipped += 1;
      continue;
    }
    try {
      const detail = await provider.getHistoricalSessionDetail(session.id);
      if (detail.timingPatches.length === 0 && detail.events.length === 0)
        throw new Error("OpenF1 returned no historical detail");
      await persistSessionDetail(session.fixtureId, session.id, detail);
      imported += 1;
    } catch (error) {
      failed += 1;
      const message = `${session.id}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(message);
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
    },
  });
  return { runId: run.id, year: options.year, matched: targets.length, imported, skipped, failed };
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
      await tx.fixtureDataProfile.update({
        where: { fixtureId },
        data: { coverage: "event-data", importedAt: new Date() },
      });
      await tx.providerCursor.upsert({
        where: { providerId_sessionId: { providerId: CURSOR_PROVIDER, sessionId } },
        update: { cursor: "complete" },
        create: { providerId: CURSOR_PROVIDER, sessionId, cursor: "complete" },
      });
    },
    { timeout: 120_000 },
  );
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
