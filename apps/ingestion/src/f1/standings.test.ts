import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { Competition, LiveEvent, Player, Season, Standing, Team, Venue } from "@sports/domain";
import type { Fixture, Session } from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { syncF1Standings } from "./standings";

/**
 * Integration tests — require the real local Postgres, same as
 * bootstrapCalendar.test.ts. Uses a distinct sportId/competition/season so
 * this never touches real F1 data a developer might already have
 * bootstrapped in the same dev DB.
 */
const SPORT_ID = "f1-test-standings-ingestion";

const competition: Competition = {
  id: "f1-test-standings-competition",
  sportId: SPORT_ID,
  slug: "f1-test-standings-competition",
  name: "Test Standings Championship",
  type: "championship",
};

const season: Season = {
  id: "f1-test-standings-season-2099",
  competitionId: competition.id,
  label: "2099",
  startDate: "2099-01-01T00:00:00Z",
  endDate: "2099-12-31T00:00:00Z",
};

const standings: Standing[] = [
  {
    id: "provider-standing-driver-1",
    competitionId: competition.id,
    seasonId: season.id,
    entityType: "player",
    entityId: "f1-test-standings-driver-1",
    points: 100,
    position: 1,
    extra: { wins: 3 },
  },
  {
    id: "provider-standing-team-1",
    competitionId: competition.id,
    seasonId: season.id,
    entityType: "team",
    entityId: "f1-test-standings-team-1",
    points: 200,
    position: 1,
    extra: { wins: 5 },
  },
];

class TestStandingsProvider implements SportsProvider {
  readonly id = "test-f1-standings";
  readonly sportId = SPORT_ID;
  getStandingsCallCount = 0;
  standingsToReturn: Standing[] = standings;

  async getCompetitions(): Promise<Competition[]> {
    return [competition];
  }
  async getSeasons(): Promise<Season[]> {
    return [season];
  }
  async getFixtures(): Promise<Fixture[]> {
    return [];
  }
  async getSessions(): Promise<Session[]> {
    return [];
  }
  async getTeams(): Promise<Team[]> {
    return [];
  }
  async getPlayers(): Promise<Player[]> {
    return [];
  }
  async getVenues(): Promise<Venue[]> {
    return [];
  }
  async getStandings(): Promise<Standing[]> {
    this.getStandingsCallCount += 1;
    return this.standingsToReturn;
  }
  async pollLiveEvents(): Promise<LiveEvent[]> {
    return [];
  }
}

async function cleanupStandings() {
  await prisma.standing.deleteMany({ where: { seasonId: season.id } });
}

async function cleanupAll() {
  await cleanupStandings();
  await prisma.season.deleteMany({ where: { id: season.id } });
  await prisma.competition.deleteMany({ where: { id: competition.id } });
}

describe("syncF1Standings (integration, real Postgres)", () => {
  beforeAll(async () => {
    await cleanupAll();
    const sportRow = await prisma.sport.upsert({
      where: { slug: SPORT_ID },
      update: {},
      create: { slug: SPORT_ID, name: "Test Standings Sport", status: "beta" },
    });
    await prisma.competition.create({
      data: { id: competition.id, sportId: sportRow.id, slug: competition.slug, name: competition.name, type: competition.type },
    });
    await prisma.season.create({
      data: { id: season.id, competitionId: competition.id, label: season.label, startDate: new Date(season.startDate), endDate: new Date(season.endDate) },
    });
  });
  afterAll(cleanupAll);

  it("writes normalized standings for a bootstrapped season", async () => {
    await cleanupStandings();
    const provider = new TestStandingsProvider();
    const summary = await syncF1Standings(provider, { seasonLabels: ["2099"] });

    expect(summary).toEqual({ seasonsSynced: 1, standingsWritten: 2 });

    const rows = await prisma.standing.findMany({ where: { seasonId: season.id } });
    expect(rows).toHaveLength(2);
    const driverRow = rows.find((r) => r.entityId === "f1-test-standings-driver-1");
    expect(driverRow?.points).toBe(100);
    expect(driverRow?.position).toBe(1);
    expect(driverRow?.extra).toEqual({ wins: 3 });
  });

  it("is idempotent via the (seasonId, entityType, entityId) unique key — re-syncing updates in place, no duplicate rows", async () => {
    const provider = new TestStandingsProvider();
    await syncF1Standings(provider, { seasonLabels: ["2099"] });
    await syncF1Standings(provider, { seasonLabels: ["2099"] });

    const rows = await prisma.standing.findMany({ where: { seasonId: season.id } });
    expect(rows).toHaveLength(2);
  });

  it("updates points/position in place when they change on re-sync, rather than creating a second row", async () => {
    const provider = new TestStandingsProvider();
    await syncF1Standings(provider, { seasonLabels: ["2099"] });

    provider.standingsToReturn = standings.map((s) => (s.entityId === "f1-test-standings-driver-1" ? { ...s, points: 125, position: 2 } : s));
    await syncF1Standings(provider, { seasonLabels: ["2099"] });

    const rows = await prisma.standing.findMany({ where: { seasonId: season.id } });
    expect(rows).toHaveLength(2);
    const driverRow = rows.find((r) => r.entityId === "f1-test-standings-driver-1");
    expect(driverRow?.points).toBe(125);
    expect(driverRow?.position).toBe(2);
  });

  it("skips a season that hasn't been bootstrapped yet, without throwing", async () => {
    const provider = new TestStandingsProvider();
    const summary = await syncF1Standings(provider, { seasonLabels: ["1900-not-bootstrapped"] });
    expect(summary).toEqual({ seasonsSynced: 0, standingsWritten: 0 });
  });

  it("skips entirely (without throwing) when the competition itself hasn't been bootstrapped", async () => {
    class UnbootstrappedProvider extends TestStandingsProvider {
      async getCompetitions() {
        return [{ ...competition, id: "f1-test-standings-unbootstrapped-competition" }];
      }
    }
    const provider = new UnbootstrappedProvider();
    const summary = await syncF1Standings(provider, { seasonLabels: ["2099"] });
    expect(summary).toEqual({ seasonsSynced: 0, standingsWritten: 0 });
  });

  it("continues past a season whose getStandings call throws, rather than crashing the whole sync", async () => {
    class FlakyProvider extends TestStandingsProvider {
      async getStandings(): Promise<Standing[]> {
        throw new Error("simulated provider failure");
      }
    }
    const provider = new FlakyProvider();
    await expect(syncF1Standings(provider, { seasonLabels: ["2099"] })).resolves.toEqual({
      seasonsSynced: 0,
      standingsWritten: 0,
    });
  });
});
