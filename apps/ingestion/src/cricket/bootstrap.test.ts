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
import { bootstrapCricketCurrent, bootstrapCricketDiscovery, bootstrapCricketMetadata } from "./bootstrap";

/**
 * Integration test — requires the real local Postgres, same pattern as
 * `../f1/bootstrapCalendar.test.ts`. A plain `SportsProvider`
 * implementation, not `CricketDataAdapter` — bootstrap is tested against
 * the abstraction it actually depends on, not one vendor. Uses a distinct
 * sportId ("cricket-test-ingestion") so this never touches real cricket
 * data a developer might already have bootstrapped in the same dev DB.
 */
const SPORT_ID = "cricket-test-ingestion";

const competition: Competition = {
  id: "cricket-test-competition",
  sportId: SPORT_ID,
  slug: "cricket-test-competition",
  name: "Test Premier League 2099",
  type: "tournament",
};

const season: Season = {
  id: "cricket-test-season-2099",
  competitionId: competition.id,
  label: "2099",
  startDate: "2099-01-01T00:00:00Z",
  endDate: "2099-01-20T00:00:00Z",
};

const venue: Venue = { id: "cricket-test-venue-1", name: "Test Stadium, Test City", country: null, timezone: "UTC" };

const teams: Team[] = [
  { id: "cricket-test-team-1", sportId: SPORT_ID, name: "Test Team One", slug: "test-team-one", country: null, colorHex: null },
  { id: "cricket-test-team-2", sportId: SPORT_ID, name: "Test Team Two", slug: "test-team-two", country: null, colorHex: null },
];

const fixtures: Fixture[] = [
  {
    id: "cricket-test-fixture-1",
    sportId: SPORT_ID,
    competitionId: competition.id,
    seasonId: season.id,
    slug: "test-team-one-vs-test-team-two-1",
    name: "Test Team One vs Test Team Two, 1st Match",
    status: "live",
    startTime: "2099-01-05T14:00:00Z",
    venueId: venue.id,
  },
];

const sessionsByFixture: Record<string, Session[]> = {
  "cricket-test-fixture-1": [
    { id: "cricket-test-session-1a", fixtureId: "cricket-test-fixture-1", type: "1ST_INNINGS", status: "completed", startTime: "2099-01-05T14:00:00Z", endTime: null },
    { id: "cricket-test-session-1b", fixtureId: "cricket-test-fixture-1", type: "2ND_INNINGS", status: "live", startTime: "2099-01-05T14:00:00Z", endTime: null },
  ],
};

class TestCricketProvider implements SportsProvider {
  readonly id = "test-cricket";
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
    return [];
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
  await prisma.session.deleteMany({ where: { fixtureId: { in: fixtures.map((f) => f.id) } } });
  await prisma.fixture.deleteMany({ where: { id: { in: fixtures.map((f) => f.id) } } });
  await prisma.venue.deleteMany({ where: { id: venue.id } });
  await prisma.season.deleteMany({ where: { id: season.id } });
  await prisma.competition.deleteMany({ where: { id: competition.id } });
  await prisma.team.deleteMany({ where: { id: { in: teams.map((t) => t.id) } } });
}

describe("bootstrapCricketCurrent (integration, real Postgres)", () => {
  afterAll(cleanup);

  it("bootstraps whatever's currently returned by the provider — competitions, seasons, venues, teams, fixtures, and real innings-scoped sessions", async () => {
    await cleanup();
    const provider = new TestCricketProvider();
    const summary = await bootstrapCricketCurrent(provider);

    expect(summary).toEqual({ competitions: 1, seasons: 1, venues: 1, teams: 2, fixtures: 1, sessions: 2 });

    const dbSessions = await prisma.session.findMany({ where: { fixtureId: "cricket-test-fixture-1" } });
    expect(dbSessions.map((s) => s.type).sort()).toEqual(["1ST_INNINGS", "2ND_INNINGS"]);
  });

  it("is idempotent — running bootstrap twice creates no duplicate rows", async () => {
    const provider = new TestCricketProvider();
    await bootstrapCricketCurrent(provider);
    await bootstrapCricketCurrent(provider);

    const dbFixtures = await prisma.fixture.findMany({ where: { id: { in: fixtures.map((f) => f.id) } } });
    const dbSessions = await prisma.session.findMany({ where: { fixtureId: "cricket-test-fixture-1" } });
    expect(dbFixtures).toHaveLength(1);
    expect(dbSessions).toHaveLength(2);
  });

  it("never calls getFixtureDetail-equivalent — this is a plain SportsProvider, confirming bootstrap only depends on the shared interface, not a specific adapter's bonus methods", async () => {
    const provider = new TestCricketProvider();
    await expect(bootstrapCricketCurrent(provider)).resolves.toBeDefined();
  });

  it("updates an existing fixture's status on re-bootstrap rather than erroring", async () => {
    const provider = new TestCricketProvider();
    await bootstrapCricketCurrent(provider);

    fixtures[0].status = "completed"; // deliberately mutating the module-level fixture to prove update-in-place
    await bootstrapCricketCurrent(provider);

    const updated = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtures[0].id } });
    expect(updated.status).toBe("completed");

    fixtures[0].status = "live"; // restore for other tests
    await bootstrapCricketCurrent(provider);
  });
});

/**
 * Cricket Checkpoint 4 (request-budget remediation) — the real, quantified
 * bug this checkpoint fixed: the original `bootstrapCricketCurrent` was
 * one function ingestion had no way to call "half of" — `job.ts` had to
 * either re-run the whole thing (competitions+seasons+venues+teams+
 * fixtures+sessions) every tick, or nothing. These tests exist to prove
 * the split actually has the property that makes the fix possible:
 * `bootstrapCricketDiscovery` alone never calls `getCompetitions`/
 * `getSeasons` (the real `series_info`-consuming, slow-changing calls),
 * and `bootstrapCricketMetadata` alone never calls the per-fixture
 * discovery methods — so `job.ts` can run metadata on a long TTL and
 * discovery every tick, exactly as intended.
 */
describe("bootstrapCricketMetadata / bootstrapCricketDiscovery (integration, real Postgres)", () => {
  afterAll(cleanup);

  function countingProvider() {
    const calls = { getCompetitions: 0, getSeasons: 0, getVenues: 0, getTeams: 0, getFixtures: 0, getSessions: 0 };
    const base = new TestCricketProvider();
    const provider: SportsProvider = {
      id: base.id,
      sportId: base.sportId,
      getCompetitions: async () => {
        calls.getCompetitions += 1;
        return base.getCompetitions();
      },
      getSeasons: async () => {
        calls.getSeasons += 1;
        return base.getSeasons();
      },
      getVenues: async () => {
        calls.getVenues += 1;
        return base.getVenues();
      },
      getTeams: async () => {
        calls.getTeams += 1;
        return base.getTeams();
      },
      getFixtures: async () => {
        calls.getFixtures += 1;
        return base.getFixtures();
      },
      getSessions: async (input: { fixtureId: string }) => {
        calls.getSessions += 1;
        return base.getSessions(input);
      },
      getPlayers: () => base.getPlayers(),
      getStandings: () => base.getStandings(),
      pollLiveEvents: () => base.pollLiveEvents(),
    };
    return { provider, calls };
  }

  it("bootstrapCricketMetadata never calls the discovery methods (venues/teams/fixtures/sessions)", async () => {
    await cleanup();
    const { provider, calls } = countingProvider();
    const metadata = await bootstrapCricketMetadata(provider);

    expect(metadata.competitions).toBe(1);
    expect(metadata.seasons).toBe(1);
    expect(metadata.pairs).toEqual([{ competitionId: competition.id, seasonId: season.id }]);
    expect(calls.getVenues).toBe(0);
    expect(calls.getTeams).toBe(0);
    expect(calls.getFixtures).toBe(0);
    expect(calls.getSessions).toBe(0);

    await prisma.season.deleteMany({ where: { id: season.id } });
    await prisma.competition.deleteMany({ where: { id: competition.id } });
  });

  it("bootstrapCricketDiscovery, given known pairs, never calls getCompetitions/getSeasons", async () => {
    await cleanup();
    const { provider, calls } = countingProvider();
    // Metadata must exist first (real FK requirement — Fixture.competitionId/seasonId), but not counted here.
    const metadata = await bootstrapCricketMetadata(provider);
    calls.getCompetitions = 0;
    calls.getSeasons = 0;

    const discovery = await bootstrapCricketDiscovery(provider, metadata.pairs);

    expect(discovery).toEqual({ venues: 1, teams: 2, fixtures: 1, sessions: 2 });
    expect(calls.getCompetitions).toBe(0);
    expect(calls.getSeasons).toBe(0);
  });

  it("running bootstrapCricketDiscovery repeatedly (simulating many poll ticks) never re-issues getCompetitions/getSeasons — the real fix for the ~500 requests/day bootstrap-on-every-tick bug", async () => {
    await cleanup();
    const { provider, calls } = countingProvider();
    const metadata = await bootstrapCricketMetadata(provider);
    calls.getCompetitions = 0;
    calls.getSeasons = 0;

    for (let i = 0; i < 10; i++) {
      await bootstrapCricketDiscovery(provider, metadata.pairs);
    }

    expect(calls.getCompetitions).toBe(0);
    expect(calls.getSeasons).toBe(0);
  });
});
