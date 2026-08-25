import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type {
  Competition,
  Fixture,
  LiveEvent,
  Player,
  Season,
  Session,
  Standing,
  Team,
  Venue,
} from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { bootstrapF1Calendar } from "./bootstrapCalendar";

/**
 * Integration tests — require the real local Postgres (`docker compose up`,
 * same as `pnpm dev`; see README.md and vitest.setup.ts). Deliberately a
 * plain `SportsProvider` implementation, not OpenF1Adapter — bootstrap is
 * tested against the abstraction it actually depends on, not one vendor.
 * Uses a distinct sportId ("f1-test-ingestion") so this never touches real
 * F1 data a developer might already have bootstrapped in the same dev DB.
 */
const SPORT_ID = "f1-test-ingestion";

const competition: Competition = {
  id: "f1-test-competition",
  sportId: SPORT_ID,
  slug: "f1-test-competition",
  name: "Test Championship",
  type: "championship",
};

const season: Season = {
  id: "f1-test-season-2099",
  competitionId: competition.id,
  label: "2099",
  startDate: "2099-01-01T00:00:00Z",
  endDate: "2099-12-31T00:00:00Z",
};

const venue: Venue = { id: "f1-test-venue-1", name: "Test Circuit", country: "Testland", timezone: "+00:00" };

const fixtures: Fixture[] = [
  {
    id: "f1-test-fixture-1",
    sportId: SPORT_ID,
    competitionId: competition.id,
    seasonId: season.id,
    slug: "test-grand-prix-1-2099",
    name: "Test Grand Prix 1",
    status: "scheduled",
    startTime: "2099-03-01T00:00:00Z",
    venueId: venue.id,
  },
  {
    id: "f1-test-fixture-2",
    sportId: SPORT_ID,
    competitionId: competition.id,
    seasonId: season.id,
    slug: "test-grand-prix-2-2099",
    name: "Test Grand Prix 2",
    status: "scheduled",
    startTime: "2099-04-01T00:00:00Z",
    venueId: venue.id,
  },
];

const sessionsByFixture: Record<string, Session[]> = {
  "f1-test-fixture-1": [
    { id: "f1-test-session-1a", fixtureId: "f1-test-fixture-1", type: "QUALIFYING", status: "scheduled", startTime: "2099-03-01T00:00:00Z", endTime: "2099-03-01T01:00:00Z" },
    { id: "f1-test-session-1b", fixtureId: "f1-test-fixture-1", type: "RACE", status: "scheduled", startTime: "2099-03-02T00:00:00Z", endTime: "2099-03-02T02:00:00Z" },
  ],
  "f1-test-fixture-2": [
    { id: "f1-test-session-2a", fixtureId: "f1-test-fixture-2", type: "RACE", status: "scheduled", startTime: "2099-04-01T00:00:00Z", endTime: "2099-04-01T02:00:00Z" },
  ],
};

const teams: Team[] = [
  { id: "f1-test-team-1", sportId: SPORT_ID, name: "Test Team One", slug: "test-team-one", country: null, colorHex: "#FF0000" },
  { id: "f1-test-team-2", sportId: SPORT_ID, name: "Test Team Two", slug: "test-team-two", country: null, colorHex: "#00FF00" },
];

const players: Player[] = [
  { id: "f1-test-player-1", sportId: SPORT_ID, teamId: "f1-test-team-1", name: "Driver One", role: "driver", shortName: "ONE", avatarUrl: null },
  { id: "f1-test-player-2", sportId: SPORT_ID, teamId: "f1-test-team-2", name: "Driver Two", role: "driver", shortName: "TWO", avatarUrl: null },
];

class TestSportsProvider implements SportsProvider {
  readonly id = "test-f1";
  readonly sportId = SPORT_ID;
  getSessionsCallCount = 0;

  async getCompetitions(): Promise<Competition[]> {
    return [competition];
  }
  async getSeasons(): Promise<Season[]> {
    return [season];
  }
  async getFixtures(): Promise<Fixture[]> {
    return fixtures;
  }
  async getSessions(input: { fixtureId: string }): Promise<Session[]> {
    this.getSessionsCallCount += 1;
    return sessionsByFixture[input.fixtureId] ?? [];
  }
  async getTeams(): Promise<Team[]> {
    return teams;
  }
  async getPlayers(): Promise<Player[]> {
    return players;
  }
  async getVenues(): Promise<Venue[]> {
    return [venue];
  }
  async getStandings(): Promise<Standing[]> {
    return [];
  }
  async pollLiveEvents(): Promise<LiveEvent[]> {
    return [];
  }
}

async function cleanup() {
  // Deleting by the known deterministic ids, not `sportId: SPORT_ID` — the
  // real rows' `sportId` is the resolved Sport *row id* (a cuid), not the
  // provider's slug constant (see bootstrapCalendar.ts's doc comment on the
  // same mix-up, caught in application code by this very test file).
  await prisma.session.deleteMany({ where: { fixtureId: { in: fixtures.map((f) => f.id) } } });
  await prisma.fixture.deleteMany({ where: { id: { in: fixtures.map((f) => f.id) } } });
  await prisma.venue.deleteMany({ where: { id: venue.id } });
  await prisma.season.deleteMany({ where: { id: season.id } });
  await prisma.competition.deleteMany({ where: { id: competition.id } });
  await prisma.player.deleteMany({ where: { id: { in: players.map((p) => p.id) } } });
  await prisma.team.deleteMany({ where: { id: { in: teams.map((t) => t.id) } } });
}

describe("bootstrapF1Calendar (integration, real Postgres)", () => {
  afterAll(cleanup);

  it("bootstraps the full calendar — all fixtures, all sessions, not just the first of each", async () => {
    await cleanup();
    const provider = new TestSportsProvider();
    const summary = await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });

    expect(summary).toEqual({ seasons: 1, venues: 1, fixtures: 2, sessions: 3, teams: 2, players: 2 });

    const dbFixtures = await prisma.fixture.findMany({ where: { id: { in: fixtures.map((f) => f.id) } } });
    expect(dbFixtures).toHaveLength(2);

    const dbSessions = await prisma.session.findMany({ where: { fixtureId: { in: fixtures.map((f) => f.id) } } });
    expect(dbSessions).toHaveLength(3);
  });

  it("is idempotent — running bootstrap twice creates no duplicate rows", async () => {
    const provider = new TestSportsProvider();
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });

    const dbFixtures = await prisma.fixture.findMany({ where: { id: { in: fixtures.map((f) => f.id) } } });
    const dbSessions = await prisma.session.findMany({ where: { fixtureId: { in: fixtures.map((f) => f.id) } } });
    const dbTeams = await prisma.team.findMany({ where: { id: { in: teams.map((t) => t.id) } } });
    const dbPlayers = await prisma.player.findMany({ where: { id: { in: players.map((p) => p.id) } } });
    const dbVenues = await prisma.venue.findMany({ where: { id: venue.id } });

    expect(dbFixtures).toHaveLength(2);
    expect(dbSessions).toHaveLength(3);
    expect(dbTeams).toHaveLength(2);
    expect(dbPlayers).toHaveLength(2);
    expect(dbVenues).toHaveLength(1);
  });

  it("paces session-fetch requests but still fetches sessions for every fixture", async () => {
    const provider = new TestSportsProvider();
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });
    expect(provider.getSessionsCallCount).toBe(fixtures.length);
  });

  it("updates an existing fixture's status on re-bootstrap rather than erroring", async () => {
    const provider = new TestSportsProvider();
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });

    const originalFixtures = fixtures.map((f) => ({ ...f }));
    fixtures[0].status = "completed"; // deliberately mutating the module-level fixture to prove update-in-place
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });

    const updated = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtures[0].id } });
    expect(updated.status).toBe("completed");

    // restore for other tests in this file
    fixtures[0].status = originalFixtures[0].status;
    await bootstrapF1Calendar(provider, { seasonLabels: ["2099"] });
  });
});
