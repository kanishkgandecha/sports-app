import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";

/**
 * One-time (idempotent) upsert of whatever a provider's registry endpoints
 * return, so `pollLiveEvents` has real rows in Postgres to attach events to.
 * A real adapter's registry data (competitions/fixtures/sessions) changes
 * far less often than live state, so this only needs to run at worker
 * startup — not on every poll tick.
 */
export async function bootstrapFromProvider(provider: SportsProvider) {
  const [sport] = await Promise.all([
    prisma.sport.upsert({
      where: { slug: provider.sportId },
      update: {},
      create: { slug: provider.sportId, name: "Synthetic", status: "beta" },
    }),
  ]);

  const [competition] = await provider.getCompetitions();
  const dbCompetition = await prisma.competition.upsert({
    where: { sportId_slug: { sportId: sport.id, slug: competition.slug } },
    update: { name: competition.name },
    create: {
      id: competition.id,
      sportId: sport.id,
      slug: competition.slug,
      name: competition.name,
      type: competition.type,
    },
  });

  const [season] = await provider.getSeasons({ competitionId: competition.id });
  const dbSeason = await prisma.season.upsert({
    where: { competitionId_label: { competitionId: dbCompetition.id, label: season.label } },
    update: {},
    create: {
      id: season.id,
      competitionId: dbCompetition.id,
      label: season.label,
      startDate: new Date(season.startDate),
      endDate: new Date(season.endDate),
    },
  });

  const [fixture] = await provider.getFixtures({
    competitionId: competition.id,
    seasonId: season.id,
  });
  const dbFixture = await prisma.fixture.upsert({
    where: { sportId_slug: { sportId: sport.id, slug: fixture.slug } },
    update: { status: fixture.status },
    create: {
      id: fixture.id,
      sportId: sport.id,
      competitionId: dbCompetition.id,
      seasonId: dbSeason.id,
      slug: fixture.slug,
      name: fixture.name,
      status: fixture.status,
      startTime: new Date(fixture.startTime),
    },
  });

  const [session] = await provider.getSessions({ fixtureId: fixture.id });
  const dbSession = await prisma.session.upsert({
    where: { id: session.id },
    update: { status: session.status },
    create: {
      id: session.id,
      fixtureId: dbFixture.id,
      type: session.type,
      status: session.status,
      startTime: new Date(session.startTime),
    },
  });

  return { sport, session: dbSession };
}
