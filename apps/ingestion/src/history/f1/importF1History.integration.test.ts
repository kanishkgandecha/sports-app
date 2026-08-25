import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { Competition, Fixture, FixtureStatus, Session, SessionStatus } from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { importF1Season } from "./importF1History";

const FIXTURE_ID = "history-refresh-fixture";
const SESSION_ID = "history-refresh-session";
const COMPETITION_ID = "history-refresh-competition";
const SEASON_ID = "history-refresh-season";
const VENUE_ID = "history-refresh-venue";

class RefreshProvider implements SportsProvider {
  readonly id = "openf1";
  readonly sportId = "f1";
  fixtureStatus: FixtureStatus = "live";
  sessionStatus: SessionStatus = "live";

  async getCompetitions(): Promise<Competition[]> {
    return [{ id: COMPETITION_ID, sportId: "f1", slug: COMPETITION_ID, name: "Refresh Test", type: "championship" }];
  }
  async getSeasons() {
    return [
      {
        id: SEASON_ID,
        competitionId: COMPETITION_ID,
        label: "2026",
        startDate: "2026-01-01T00:00:00.000Z",
        endDate: "2026-12-31T00:00:00.000Z",
      },
    ];
  }
  async getVenues() {
    return [{ id: VENUE_ID, name: "Refresh Circuit", country: "Testland", timezone: "+00:00" }];
  }
  async getFixtures(): Promise<Fixture[]> {
    return [
      {
        id: FIXTURE_ID,
        sportId: "f1",
        competitionId: COMPETITION_ID,
        seasonId: SEASON_ID,
        slug: FIXTURE_ID,
        name: "Refresh Grand Prix",
        status: this.fixtureStatus,
        startTime: "2026-08-01T00:00:00.000Z",
        venueId: VENUE_ID,
      },
    ];
  }
  async getSessions(): Promise<Session[]> {
    return [
      {
        id: SESSION_ID,
        fixtureId: FIXTURE_ID,
        type: "RACE",
        status: this.sessionStatus,
        startTime: "2026-08-01T12:00:00.000Z",
        endTime: "2026-08-01T14:00:00.000Z",
      },
    ];
  }
  async getTeams() {
    return [];
  }
  async getPlayers() {
    return [];
  }
  async getStandings() {
    return [];
  }
  async pollLiveEvents() {
    return [];
  }
}

async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  await prisma.historicalImport.deleteMany({ where: { source: "openf1", scopeKey: "2026:29:summary" } });
  await prisma.fixtureDataProfile.deleteMany({ where: { fixtureId: FIXTURE_ID } });
  await prisma.session.deleteMany({ where: { id: SESSION_ID } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.season.deleteMany({ where: { id: SEASON_ID } });
  await prisma.competition.deleteMany({ where: { id: COMPETITION_ID } });
  await prisma.venue.deleteMany({ where: { id: VENUE_ID } });
}

describe("F1 historical summary reconciliation (integration, real Postgres)", () => {
  afterAll(cleanup);

  it("refreshes existing entities without downgrading detailed coverage", async () => {
    await cleanup();
    const provider = new RefreshProvider();
    await importF1Season(provider, { year: 2026, limit: 29, requestDelayMs: 0 });
    await prisma.fixtureDataProfile.update({ where: { fixtureId: FIXTURE_ID }, data: { coverage: "event-data" } });

    provider.fixtureStatus = "completed";
    provider.sessionStatus = "completed";
    const result = await importF1Season(provider, { year: 2026, limit: 29, requestDelayMs: 0 });

    expect(result).toMatchObject({ imported: 0, skipped: 1 });
    await expect(prisma.fixture.findUniqueOrThrow({ where: { id: FIXTURE_ID } })).resolves.toMatchObject({
      status: "completed",
    });
    await expect(prisma.session.findUniqueOrThrow({ where: { id: SESSION_ID } })).resolves.toMatchObject({
      status: "completed",
    });
    await expect(
      prisma.fixtureDataProfile.findUniqueOrThrow({ where: { fixtureId: FIXTURE_ID } }),
    ).resolves.toMatchObject({
      coverage: "event-data",
    });
  });
});
