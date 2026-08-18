import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { LiveEvent } from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { pollActiveCricketSessions } from "./job";

/**
 * Integration tests — real local Postgres (publishLiveEvent/persist.ts
 * write through it), controllable fake provider — same pattern and same
 * requirement as `../f1/job.test.ts`: "provider timeout", "provider
 * error", "one failed session doesn't stop other sessions", entirely
 * offline w.r.t. CricketData.org.
 */
const SPORT_SLUG = "cricket-test-job";

class FaultyProvider implements SportsProvider {
  readonly id = "test-faulty-cricket";
  readonly sportId = SPORT_SLUG;

  async getCompetitions() { return []; }
  async getSeasons() { return []; }
  async getFixtures() { return []; }
  async getSessions() { return []; }
  async getTeams() { return []; }
  async getPlayers() { return []; }
  async getVenues() { return []; }
  async getStandings() { return []; }

  async pollLiveEvents(input: { sessionId: string }): Promise<LiveEvent[]> {
    if (input.sessionId === "bad-timeout") {
      throw new Error("Request timed out after 10000ms");
    }
    if (input.sessionId === "bad-malformed") {
      throw new Error("Malformed JSON from /match_info: Unexpected token");
    }
    if (input.sessionId === "cricket-good") {
      return [
        {
          id: "cricket-job-test-event-1",
          sportId: SPORT_SLUG,
          sessionId: "cricket-good",
          eventType: "SCORE_UPDATE",
          timestamp: "2026-01-01T00:00:00Z",
          source: "test-faulty-cricket",
          payload: { runs: 10, wickets: 0, overs: 2, deltaRuns: 4, deltaWickets: 0 },
        },
      ];
    }
    return [];
  }
}

async function cleanup() {
  const sport = await prisma.sport.findUnique({ where: { slug: SPORT_SLUG } });
  if (sport) await prisma.liveEvent.deleteMany({ where: { sportId: sport.id } });
  await prisma.session.deleteMany({ where: { id: "cricket-good" } });
  await prisma.fixture.deleteMany({ where: { id: "cricket-job-test-fixture" } });
  await prisma.season.deleteMany({ where: { id: "cricket-job-test-season" } });
  await prisma.competition.deleteMany({ where: { id: "cricket-job-test-competition" } });
}

describe("pollActiveCricketSessions — error isolation (integration, real Postgres)", () => {
  beforeAll(async () => {
    const sport = await prisma.sport.upsert({ where: { slug: SPORT_SLUG }, update: {}, create: { slug: SPORT_SLUG, name: "Test Job Sport", status: "beta" } });
    const competition = await prisma.competition.upsert({
      where: { id: "cricket-job-test-competition" },
      update: {},
      create: { id: "cricket-job-test-competition", sportId: sport.id, slug: "cricket-job-test-competition", name: "Test", type: "tournament" },
    });
    const season = await prisma.season.upsert({
      where: { id: "cricket-job-test-season" },
      update: {},
      create: { id: "cricket-job-test-season", competitionId: competition.id, label: "2099", startDate: new Date("2099-01-01"), endDate: new Date("2099-12-31") },
    });
    const fixture = await prisma.fixture.upsert({
      where: { id: "cricket-job-test-fixture" },
      update: {},
      create: {
        id: "cricket-job-test-fixture",
        sportId: sport.id,
        competitionId: competition.id,
        seasonId: season.id,
        slug: "cricket-job-test-fixture",
        name: "Test Fixture",
        status: "live",
        startTime: new Date("2099-01-01"),
      },
    });
    await prisma.session.upsert({
      where: { id: "cricket-good" },
      update: {},
      create: { id: "cricket-good", fixtureId: fixture.id, type: "1ST_INNINGS", status: "live", startTime: new Date("2099-01-01") },
    });
  });
  afterAll(cleanup);

  it("does not throw when every active session's poll fails (provider timeout + malformed response)", async () => {
    const provider = new FaultyProvider();
    await expect(
      pollActiveCricketSessions(
        provider,
        [
          { sessionId: "bad-timeout", reason: "test" },
          { sessionId: "bad-malformed", reason: "test" },
        ],
        new Map(),
        new Map(),
      ),
    ).resolves.toBeUndefined();
  });

  it("a failing session does not prevent a healthy session in the same tick from being processed", async () => {
    const provider = new FaultyProvider();
    await pollActiveCricketSessions(
      provider,
      [
        { sessionId: "bad-timeout", reason: "test" },
        { sessionId: "cricket-good", reason: "test" },
        { sessionId: "bad-malformed", reason: "test" },
      ],
      new Map(),
      new Map(),
    );

    const published = await prisma.liveEvent.findUnique({ where: { id: "cricket-job-test-event-1" } });
    expect(published).not.toBeNull();
    expect(published?.eventType).toBe("SCORE_UPDATE");
  });

  it("handles an empty active-session list without throwing", async () => {
    const provider = new FaultyProvider();
    await expect(pollActiveCricketSessions(provider, [], new Map(), new Map())).resolves.toBeUndefined();
  });

  it("advances the cursor only for sessions that succeeded, not ones that failed", async () => {
    const provider = new FaultyProvider();
    const cursors = new Map<string, string>();
    await pollActiveCricketSessions(
      provider,
      [
        { sessionId: "bad-timeout", reason: "test" },
        { sessionId: "cricket-good", reason: "test" },
      ],
      cursors,
      new Map(),
    );
    expect(cursors.has("bad-timeout")).toBe(false);
    expect(cursors.get("cricket-good")).toBe("2026-01-01T00:00:00Z");
  });

  it("does not attempt getInningsState/getFixtureDetail against a plain SportsProvider without those bonus methods (no crash, no state refresh)", async () => {
    const provider = new FaultyProvider();
    const lastStateRefresh = new Map<string, number>();
    await pollActiveCricketSessions(provider, [{ sessionId: "cricket-good", reason: "test" }], new Map(), lastStateRefresh);
    expect(lastStateRefresh.size).toBe(0);
  });
});
