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

/**
 * Bootstraps whatever's currently live/recent — NOT a full historical
 * calendar the way `bootstrapF1Calendar` is. Deliberate: CricketData.org's
 * real, confirmed rate limit (100 requests/day — see the adapter's doc
 * comment) makes browsing/backfilling full tournament history infeasible,
 * and this checkpoint's actual deliverable is the live pipeline (bootstrap
 * → innings state → ball events), not historical completeness.
 *
 * Deliberately does NOT call `getFixtureDetail` (toss/format/result) per
 * fixture here — that's a real `match_info` call *per match*, which would
 * turn one bootstrap tick into N real requests for N current matches
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
export async function bootstrapCricketCurrent(provider: SportsProvider): Promise<CricketBootstrapSummary> {
  const summary: CricketBootstrapSummary = { competitions: 0, seasons: 0, venues: 0, teams: 0, fixtures: 0, sessions: 0 };

  const sportRow = await prisma.sport.upsert({
    where: { slug: provider.sportId },
    update: {},
    create: { slug: provider.sportId, name: "Cricket", status: "beta" },
  });

  const competitions = await provider.getCompetitions();
  for (const competition of competitions) {
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
    summary.competitions += 1;

    const seasons = await provider.getSeasons({ competitionId: competition.id });
    for (const season of seasons) {
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

      const teams = await provider.getTeams({ competitionId: competition.id });
      for (const team of teams) {
        await prisma.team.upsert({
          where: { id: team.id },
          update: { name: team.name, colorHex: team.colorHex },
          create: { ...team, sportId: sportRow.id },
        });
        summary.teams += 1;
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

        const sessions = await provider.getSessions({ fixtureId: fixture.id });
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
  }

  return summary;
}
