import { prisma } from "@sports/db";
import type { OpenF1HistoricalSessionAnalysis } from "@sports/providers-f1-openf1";
import { selectCompletedDetailSessions } from "./importF1Details";

export const ANALYSIS_CURSOR_PROVIDER = "openf1-history-analysis-v1";

export interface F1AnalysisProvider {
  id: "openf1";
  getHistoricalSessionAnalysis(sessionId: string): Promise<OpenF1HistoricalSessionAnalysis>;
}

export interface F1AnalysisImportOptions {
  year: number;
  limit: number;
  fixtureId?: string;
  sessionTypes?: string[] | "ALL";
  retryUnavailable?: boolean;
  force?: boolean;
  dryRun?: boolean;
  now?: Date;
  onProgress?: (progress: F1AnalysisProgress) => void;
}

export interface F1AnalysisProgress {
  year: number;
  current: number;
  total: number;
  sessionId: string;
  outcome: "imported" | "skipped" | "unavailable" | "failed";
}

export async function importF1Analysis(provider: F1AnalysisProvider, options: F1AnalysisImportOptions) {
  if (provider.id !== "openf1") throw new Error("F1 historical analysis requires OpenF1");
  if (!Number.isInteger(options.year) || options.year < 2023 || options.year > new Date().getUTCFullYear()) {
    throw new Error("analysis year must be from 2023 through the current year");
  }
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 30) {
    throw new Error("limit must be from 1 to 30");
  }

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
        select: { id: true, fixtureId: true, type: true, status: true, endTime: true },
      },
    },
  });
  const targets = fixtures.flatMap((fixture) => selectCompletedDetailSessions(fixture.sessions, sessionTypes, now));
  if (options.dryRun) {
    return {
      runId: null,
      year: options.year,
      matched: targets.length,
      imported: 0,
      skipped: targets.length,
      failed: 0,
      unavailable: 0,
    };
  }

  const typeKey = sessionTypes === "ALL" ? "all" : [...sessionTypes].sort().join(",").toLowerCase();
  const scopeKey = `${options.year}:${options.limit}:analysis:${typeKey}:${options.fixtureId ?? "all-fixtures"}`;
  const run = await prisma.historicalImport.upsert({
    where: { source_scopeKey: { source: "openf1-analysis", scopeKey } },
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
      source: "openf1-analysis",
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

  for (const [index, session] of targets.entries()) {
    const report = (outcome: F1AnalysisProgress["outcome"]) =>
      options.onProgress?.({
        year: options.year,
        current: index + 1,
        total: targets.length,
        sessionId: session.id,
        outcome,
      });
    const cursor = await prisma.providerCursor.findUnique({
      where: { providerId_sessionId: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId: session.id } },
    });
    if (!options.force && cursor?.cursor === "complete") {
      skipped += 1;
      report("skipped");
      continue;
    }
    if (!options.force && !options.retryUnavailable && cursor?.cursor === "upstream-unavailable") {
      skipped += 1;
      unavailable += 1;
      report("unavailable");
      continue;
    }

    try {
      const analysis = await provider.getHistoricalSessionAnalysis(session.id);
      if (analysis.classifications.length === 0 && analysis.laps.length === 0 && analysis.stints.length === 0) {
        await saveAnalysisCursor(session.id, "upstream-unavailable");
        unavailable += 1;
        skipped += 1;
        report("unavailable");
        continue;
      }

      await persistSessionAnalysis(session.id, analysis);
      imported += 1;
      report("imported");
    } catch (error) {
      failed += 1;
      const reason = error instanceof Error ? error.message : String(error);
      const message = `${session.id}: ${reason}`;
      errors.push(message);
      console.error(`[f1-analysis] ${message}`);
      report("failed");
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

async function persistSessionAnalysis(sessionId: string, analysis: OpenF1HistoricalSessionAnalysis) {
  await prisma.$transaction(
    async (tx) => {
      await tx.sessionClassification.deleteMany({ where: { sessionId } });
      await tx.lap.deleteMany({ where: { sessionId } });
      await tx.tyreStint.deleteMany({ where: { sessionId } });
      await tx.sessionClassification.createMany({ data: analysis.classifications });
      for (const laps of chunks(analysis.laps, 1_000)) {
        await tx.lap.createMany({
          data: laps.map((lap) => ({ ...lap, startedAt: lap.startedAt ? new Date(lap.startedAt) : null })),
        });
      }
      await tx.tyreStint.createMany({ data: analysis.stints });
      await tx.providerCursor.upsert({
        where: { providerId_sessionId: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId } },
        update: { cursor: "complete" },
        create: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId, cursor: "complete" },
      });
    },
    { timeout: 120_000 },
  );
}

async function saveAnalysisCursor(sessionId: string, cursor: string) {
  await prisma.providerCursor.upsert({
    where: { providerId_sessionId: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId } },
    update: { cursor },
    create: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId, cursor },
  });
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
