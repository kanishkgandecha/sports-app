import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";

export interface CricketBootstrapSummary {
  competitions: number;
  seasons: number;
  venues: number;
  teams: number;
  fixtures: number;
  sessions: number;
}

export interface CricketCompetitionSeasonPair {
  competitionId: string;
  seasonId: string;
}

/**
 * Cricket Checkpoint 4 (request-budget remediation) — real, quantified
 * audit finding: `getCompetitions()`/`getSeasons()` are the two
 * `series_info`-consuming calls (the adapter now dedupes *within* one
 * bootstrap pass — see `CricketDataAdapter`'s `cachedRequest`), but the
 * original `bootstrapCricketCurrent` re-ran BOTH on every single 30-minute
 * poll tick, unconditionally — competitions/seasons genuinely change on
 * the order of days, not every 30 minutes, so this alone produced roughly
 * 500+ real requests/day with zero live matches (see docs/CONTEXT.md's
 * Cricket Checkpoint 4 remediation section for the full arithmetic).
 *
 * Split into two phases so `apps/ingestion/src/cricket/job.ts` can run
 * them on genuinely different cadences:
 *
 *  - `bootstrapCricketMetadata` — competitions + seasons. Real but
 *    slow-changing reference data; a real `series_info` call per series
 *    (bounded by `maxSeriesLookups`). Run at startup and on a long TTL
 *    (`cricketMetadataRefreshIntervalMs`, default 6h — see config.ts).
 *  - `bootstrapCricketDiscovery` — venues/teams/fixtures/sessions for a
 *    known set of `{competitionId, seasonId}` pairs. Entirely free in
 *    steady state (every call this makes shares the adapter's cached
 *    `getCurrentMatches()`/`getSessions()`-from-cached-list paths — see
 *    the adapter's own doc comments) — safe to run every poll tick, which
 *    is what actually keeps fixture status (scheduled → live → completed)
 *    and newly-appearing matches picked up promptly.
 *
 * `bootstrapCricketCurrent` remains as a thin wrapper doing both phases in
 * one pass — the full, original behavior — for callers (tests, a
 * from-scratch startup) that want the complete bootstrap in one call.
 */
export async function upsertCricketSport(provider: SportsProvider) {
  return prisma.sport.upsert({
    where: { slug: provider.sportId },
    update: {},
    create: { slug: provider.sportId, name: "Cricket", status: "beta" },
  });
}

export async function bootstrapCricketMetadata(
  provider: SportsProvider,
): Promise<{ pairs: CricketCompetitionSeasonPair[]; competitions: number; seasons: number }> {
  const sportRow = await upsertCricketSport(provider);
  const pairs: CricketCompetitionSeasonPair[] = [];
  let competitions = 0;
  let seasons = 0;

  const competitionRows = await provider.getCompetitions();
  for (const competition of competitionRows) {
    await prisma.competition.upsert({
      where: { id: competition.id },
      update: { name: competition.name },
      create: {
        id: competition.id,
        sportId: sportRow.id,
        slug: competition.slug,
        name: competition.name,
        type: competition.type,
      },
    });
    competitions += 1;

    const seasonRows = await provider.getSeasons({ competitionId: competition.id });
    for (const season of seasonRows) {
      await prisma.season.upsert({
        where: { id: season.id },
        update: {},
        create: {
          id: season.id,
          competitionId: competition.id,
          label: season.label,
          startDate: new Date(season.startDate),
          endDate: new Date(season.endDate),
        },
      });
      seasons += 1;
      pairs.push({ competitionId: competition.id, seasonId: season.id });
    }
  }

  return { pairs, competitions, seasons };
}

/**
 * Deliberately does NOT call `getFixtureDetail` (toss/format/result) per
 * fixture here — that's a real `match_info` call *per match*, which would
 * turn one discovery tick into N real requests for N current matches
 * (there were 18 in a single real `currentMatches` snapshot this
 * checkpoint captured). `CricketFixtureDetail` is populated later, only
 * for fixtures that are actually live (see job.ts) — the same "don't pay
 * for what you don't need yet" discipline the adapter's own
 * `getCachedCurrentMatches` doc comment describes.
 *
 * Idempotent the same way `bootstrapF1Calendar` is: every entity's `id`
 * comes from the provider adapter's own deterministic id builders, so
 * `upsert({where:{id}})` can't create duplicates on a second run.
 */
export async function bootstrapCricketDiscovery(
  provider: SportsProvider,
  pairs: CricketCompetitionSeasonPair[],
): Promise<{ venues: number; teams: number; fixtures: number; sessions: number }> {
  const sportRow = await upsertCricketSport(provider);
  let venues = 0;
  let teams = 0;
  let fixtures = 0;
  let sessions = 0;

  for (const { competitionId, seasonId } of pairs) {
    // Venues before fixtures — Fixture.venueId is a real FK.
    const venueRows = await provider.getVenues({ competitionId, seasonId });
    for (const venue of venueRows) {
      await prisma.venue.upsert({
        where: { id: venue.id },
        update: { name: venue.name, country: venue.country, timezone: venue.timezone },
        create: venue,
      });
      venues += 1;
    }

    const teamRows = await provider.getTeams({ competitionId });
    for (const team of teamRows) {
      await prisma.team.upsert({
        where: { id: team.id },
        update: { name: team.name, colorHex: team.colorHex },
        create: { ...team, sportId: sportRow.id },
      });
      teams += 1;
    }

    const fixtureRows = await provider.getFixtures({ competitionId, seasonId });
    for (const fixture of fixtureRows) {
      await prisma.fixture.upsert({
        where: { id: fixture.id },
        update: { status: fixture.status, name: fixture.name, startTime: new Date(fixture.startTime) },
        create: {
          id: fixture.id,
          sportId: sportRow.id,
          competitionId,
          seasonId,
          slug: fixture.slug,
          name: fixture.name,
          status: fixture.status,
          startTime: new Date(fixture.startTime),
          venueId: fixture.venueId,
        },
      });
      fixtures += 1;

      const sessionRows = await provider.getSessions({ fixtureId: fixture.id });
      for (const session of sessionRows) {
        await prisma.session.upsert({
          where: { id: session.id },
          update: { status: session.status, endTime: session.endTime ? new Date(session.endTime) : null },
          create: {
            id: session.id,
            fixtureId: session.fixtureId,
            type: session.type,
            status: session.status,
            startTime: new Date(session.startTime),
            endTime: session.endTime ? new Date(session.endTime) : null,
          },
        });
        sessions += 1;
      }
    }
  }

  return { venues, teams, fixtures, sessions };
}

export async function bootstrapCricketCurrent(provider: SportsProvider): Promise<CricketBootstrapSummary> {
  const metadata = await bootstrapCricketMetadata(provider);
  const discovery = await bootstrapCricketDiscovery(provider, metadata.pairs);
  return { competitions: metadata.competitions, seasons: metadata.seasons, ...discovery };
}
