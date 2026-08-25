import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";
import { mapWithRateLimit } from "../concurrency";
import { config } from "../config";
import { logger } from "../logger";

export interface BootstrapSummary {
  seasons: number;
  venues: number;
  fixtures: number;
  sessions: number;
  teams: number;
  players: number;
}

/**
 * Full-calendar bootstrap — fixes the Phase 0 limitation identified at
 * Checkpoint 2/3 (docs/CONTEXT.md §7.5): the old `bootstrapFromProvider`
 * (still used by the synthetic job, untouched) only ever processed the
 * first competition/season/fixture/session. This one processes everything
 * the provider returns for the configured season(s).
 *
 * Idempotent by construction, not by an added uniqueness check: every
 * entity here gets its `id` from the provider adapter's own deterministic
 * id builders (e.g. `f1-meeting-{meeting_key}`), so `upsert({where:{id}})`
 * naturally can't create duplicates on a second run — see docs/CONTEXT.md §9
 * "Idempotency" for why this needed no schema changes at all.
 *
 * Order matters for foreign keys: Sport -> Competition -> Season -> Venue ->
 * Fixture (references Venue) -> Session (references Fixture). Teams/Players
 * are fetched once, globally, not per season/fixture — see the
 * "Known limitations" note in docs/CONTEXT.md §9 about why (the
 * `SportsProvider` interface has no session/fixture scoping for rosters).
 */
export async function bootstrapF1Calendar(
  provider: SportsProvider,
  options: { seasonLabels: string[] },
): Promise<BootstrapSummary> {
  const summary: BootstrapSummary = { seasons: 0, venues: 0, fixtures: 0, sessions: 0, teams: 0, players: 0 };

  const sportRow = await prisma.sport.upsert({
    where: { slug: provider.sportId },
    update: {},
    create: { slug: provider.sportId, name: "Formula 1", status: "beta" },
  });

  const [competition] = await provider.getCompetitions();
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

  const allSeasons = await provider.getSeasons({ competitionId: competition.id });
  const targetSeasons = allSeasons.filter((s) => options.seasonLabels.includes(s.label));
  if (targetSeasons.length === 0) {
    logger.warn(
      { requested: options.seasonLabels, available: allSeasons.map((s) => s.label) },
      "none of the requested F1 bootstrap seasons were found by the provider",
    );
  }

  for (const season of targetSeasons) {
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
    summary.seasons += 1;

    // Venues before fixtures — Fixture.venueId is a real FK.
    const venues = await provider.getVenues({ competitionId: competition.id, seasonId: season.id });
    for (const venue of venues) {
      await prisma.venue.upsert({
        where: { id: venue.id },
        update: { name: venue.name, country: venue.country, timezone: venue.timezone },
        create: venue,
      });
      summary.venues += 1;
    }

    const fixtures = await provider.getFixtures({ competitionId: competition.id, seasonId: season.id });
    for (const fixture of fixtures) {
      await prisma.fixture.upsert({
        where: { id: fixture.id },
        update: { status: fixture.status, name: fixture.name, startTime: new Date(fixture.startTime) },
        create: {
          id: fixture.id,
          sportId: sportRow.id,
          competitionId: competition.id,
          seasonId: season.id,
          slug: fixture.slug,
          name: fixture.name,
          status: fixture.status,
          startTime: new Date(fixture.startTime),
          venueId: fixture.venueId,
        },
      });
      summary.fixtures += 1;
    }

    // Sessions per fixture, paced (not just concurrency-limited — see
    // concurrency.ts's doc comment for why that distinction mattered in
    // practice against OpenF1's free-tier rate limit).
    const sessionLists = await mapWithRateLimit(fixtures, config.f1BootstrapRequestDelayMs, (fixture) =>
      provider.getSessions({ fixtureId: fixture.id }),
    );
    for (const sessions of sessionLists) {
      for (const session of sessions) {
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
        summary.sessions += 1;
      }
    }
  }

  // A brief pause before the roster fetch — extra safety margin after the
  // paced sessions loop above, which itself runs right up against OpenF1's
  // rate limit for its whole duration (docs/CONTEXT.md §9's rate-limit
  // Problem/Solution entry).
  await new Promise((resolve) => setTimeout(resolve, config.f1BootstrapRequestDelayMs));

  // Global roster snapshot — see class doc. Not scoped per season/fixture.
  //
  // Note the explicit `sportId: sportRow.id` override on both creates below
  // — a real bug caught by this checkpoint's own idempotency tests: the
  // domain `Team`/`Player` objects carry `sportId` as the *provider's* slug
  // (e.g. "f1"), not the database row's cuid `id`. Fixture/Session already
  // get this right (they build their `create` objects by hand); spreading
  // `team`/`player` directly here initially didn't, and violated
  // `Team_sportId_fkey`/`Player_sportId_fkey` the moment a provider's
  // sportId slug didn't happen to collide with a real Sport row's id.
  const teams = await provider.getTeams({ competitionId: competition.id });
  for (const team of teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: { name: team.name, colorHex: team.colorHex },
      create: { ...team, sportId: sportRow.id },
    });
    summary.teams += 1;
  }

  const players = await provider.getPlayers();
  for (const player of players) {
    await prisma.player.upsert({
      where: { id: player.id },
      update: { name: player.name, shortName: player.shortName, avatarUrl: player.avatarUrl, teamId: player.teamId },
      create: { ...player, sportId: sportRow.id },
    });
    summary.players += 1;
  }

  logger.info(summary, "F1 calendar bootstrap complete");
  return summary;
}
