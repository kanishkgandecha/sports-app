import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";

export interface F1HistoryOptions {
  year: number;
  limit: number;
  dryRun?: boolean;
  /** Delay between provider calls; OpenF1's public API is intentionally conservative. */
  requestDelayMs?: number;
}

export function rollingSeasonYears(count: number, currentYear = new Date().getUTCFullYear()): number[] {
  if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("years must be from 1 to 10");
  return Array.from({ length: count }, (_, index) => currentYear - count + index + 1);
}

export async function importF1Season(provider: SportsProvider, options: F1HistoryOptions) {
  if (!Number.isInteger(options.year) || options.year < 1950 || options.year > new Date().getUTCFullYear())
    throw new Error("year is out of range");
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 30)
    throw new Error("limit must be from 1 to 30");
  const expectedSource = options.year >= 2023 ? "openf1" : "jolpica";
  if (provider.id !== expectedSource)
    throw new Error(`${options.year} must use ${expectedSource}; overlapping F1 sources are not allowed`);

  // OpenF1's minute-scale public quota is easier to hit than its burst quota
  // during a complete season import. Staying below 30 requests/minute avoids
  // crossing that boundary as the importer moves to the next season.
  const requestDelayMs = options.requestDelayMs ?? (provider.id === "openf1" ? 2_100 : 250);
  const paced = async <T>(request: () => Promise<T>): Promise<T> => {
    const result = await request();
    if (requestDelayMs > 0) await delay(requestDelayMs);
    return result;
  };

  const [competition] = await paced(() => provider.getCompetitions());
  if (!competition) throw new Error("F1 provider returned no competition");
  const seasons = await paced(() => provider.getSeasons({ competitionId: competition.id }));
  const season = seasons.find((candidate) => candidate.label === String(options.year));
  if (!season) throw new Error(`${provider.id} has no ${options.year} season`);
  const venues = await paced(() => provider.getVenues({ competitionId: competition.id, seasonId: season.id }));
  const fixtures = (await paced(() => provider.getFixtures({ competitionId: competition.id, seasonId: season.id })))
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id))
    .slice(0, options.limit);
  const sessionLists: Awaited<ReturnType<SportsProvider["getSessions"]>>[] = [];
  for (const fixture of fixtures) {
    sessionLists.push(await paced(() => provider.getSessions({ fixtureId: fixture.id })));
  }
  if (options.dryRun)
    return {
      runId: null,
      source: provider.id,
      year: options.year,
      matched: fixtures.length,
      imported: 0,
      skipped: fixtures.length,
    };

  const scopeKey = `${options.year}:${options.limit}:summary`;
  const run = await prisma.historicalImport.upsert({
    where: { source_scopeKey: { source: provider.id, scopeKey } },
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
      source: provider.id,
      scopeKey,
      status: "running",
      metadata: { year: options.year, limit: options.limit, coverage: "summary" },
    },
  });
  let imported = 0;
  let skipped = 0;
  try {
    const sport = await prisma.sport.upsert({
      where: { slug: "f1" },
      update: {},
      create: { slug: "f1", name: "Formula 1", status: "beta" },
    });
    await prisma.competition.upsert({
      where: { id: competition.id },
      update: { name: competition.name },
      create: { ...competition, sportId: sport.id },
    });
    await prisma.season.upsert({
      where: { id: season.id },
      update: {},
      create: { ...season, startDate: new Date(season.startDate), endDate: new Date(season.endDate) },
    });
    for (const venue of venues)
      await prisma.venue.upsert({
        where: { id: venue.id },
        update: { name: venue.name, country: venue.country, timezone: venue.timezone },
        create: venue,
      });

    for (let index = 0; index < fixtures.length; index += 1) {
      const fixture = fixtures[index];
      const existing = await prisma.fixtureDataProfile.findUnique({
        where: { source_externalId: { source: provider.id, externalId: fixture.id } },
      });
      if (existing?.fixtureId === fixture.id) {
        skipped += 1;
        continue;
      }
      await prisma.$transaction(async (tx) => {
        await tx.fixture.upsert({
          where: { id: fixture.id },
          update: {
            name: fixture.name,
            status: fixture.status,
            startTime: new Date(fixture.startTime),
            venueId: fixture.venueId,
          },
          create: { ...fixture, sportId: sport.id, startTime: new Date(fixture.startTime) },
        });
        for (const session of sessionLists[index] ?? []) {
          await tx.session.upsert({
            where: { id: session.id },
            update: {
              type: session.type,
              status: session.status,
              startTime: new Date(session.startTime),
              endTime: session.endTime ? new Date(session.endTime) : null,
            },
            create: {
              ...session,
              startTime: new Date(session.startTime),
              endTime: session.endTime ? new Date(session.endTime) : null,
            },
          });
        }
        await tx.fixtureDataProfile.upsert({
          where: { fixtureId: fixture.id },
          update: {
            source: provider.id,
            externalId: fixture.id,
            coverage: "summary",
            attribution: attribution(provider.id),
            datePrecision: "instant",
            importedAt: new Date(),
          },
          create: {
            fixtureId: fixture.id,
            source: provider.id,
            externalId: fixture.id,
            coverage: "summary",
            attribution: attribution(provider.id),
            datePrecision: "instant",
          },
        });
      });
      imported += 1;
    }
    await prisma.historicalImport.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date(), importedCount: imported, skippedCount: skipped },
    });
    return { runId: run.id, source: provider.id, year: options.year, matched: fixtures.length, imported, skipped };
  } catch (error) {
    await prisma.historicalImport.update({
      where: { id: run.id },
      data: {
        status: "failed",
        completedAt: new Date(),
        importedCount: imported,
        skippedCount: skipped,
        failedCount: 1,
        error: error instanceof Error ? error.message.slice(0, 2_000) : String(error),
      },
    });
    throw error;
  }
}

function attribution(source: string): string {
  return source === "openf1" ? "OpenF1 — https://openf1.org/" : "Jolpica F1 — https://jolpi.ca/";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
