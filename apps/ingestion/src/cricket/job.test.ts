import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { LiveEvent } from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { config } from "../config";
import { initialCricketTickState, pollActiveCricketSessions, runCricketTickOnce } from "./job";

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

/**
 * Cricket Checkpoint 4 (request-budget remediation) — a provider that
 * reports real usage (`getRequestBudgetStatus`, the bonus method
 * `CricketDataAdapter` now implements) and counts every method it's
 * asked to make a "real request" for, so these tests can assert exactly
 * what got skipped.
 */
class BudgetReportingFaultyProvider extends FaultyProvider {
  callCounts = { getCompetitions: 0, getSeasons: 0, getVenues: 0, getTeams: 0, getFixtures: 0, getSessions: 0, pollLiveEvents: 0 };
  constructor(public hitsToday: number) {
    super();
  }
  getRequestBudgetStatus() {
    return { hitsToday: this.hitsToday, hitsLimit: 100, observedAt: Date.now() };
  }
  override async getCompetitions() {
    this.callCounts.getCompetitions += 1;
    return super.getCompetitions();
  }
  override async getSeasons() {
    this.callCounts.getSeasons += 1;
    return super.getSeasons();
  }
  override async getVenues() {
    this.callCounts.getVenues += 1;
    return super.getVenues();
  }
  override async getTeams() {
    this.callCounts.getTeams += 1;
    return super.getTeams();
  }
  override async getFixtures() {
    this.callCounts.getFixtures += 1;
    return super.getFixtures();
  }
  override async getSessions() {
    this.callCounts.getSessions += 1;
    return super.getSessions();
  }
  override async pollLiveEvents(input: { sessionId: string }) {
    this.callCounts.pollLiveEvents += 1;
    return super.pollLiveEvents(input);
  }
}

/**
 * These tests need their own real Postgres fixtures (`cricket-good`'s
 * `Session`/`Fixture`/etc. rows), independent of the first describe
 * block's — that block's own `afterAll(cleanup)` already tore them down
 * by the time these run (Vitest runs sibling top-level `describe` blocks
 * sequentially, in file order), so re-establishing (and re-tearing-down)
 * the same fixtures here is required, not defensive-for-no-reason.
 */
describe("Cricket Checkpoint 4 — request-budget guard (integration, real Postgres)", () => {
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
        startTime: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    // Real (not far-future) startTime, no endTime — unlike the first
    // describe block's fixtures (which only ever get passed to
    // `pollActiveCricketSessions` via an explicit target list, so their
    // literal timestamps never matter), `runCricketTickOnce`'s tests below
    // go through the real `getActiveCricketSessions` DB scan, which
    // genuinely classifies liveness from `startTime`/`endTime` — a
    // 2099 startTime would classify as "upcoming," never selected.
    await prisma.session.upsert({
      where: { id: "cricket-good" },
      update: {},
      create: { id: "cricket-good", fixtureId: fixture.id, type: "1ST_INNINGS", status: "live", startTime: new Date(Date.now() - 10 * 60 * 1000), endTime: null },
    });
  });
  afterAll(cleanup);

  describe("pollActiveCricketSessions — request-budget guard", () => {
  it("under budget (well below the safety margin): every session is polled normally", async () => {
    const provider = new BudgetReportingFaultyProvider(5); // 5 of 100, nowhere near the margin
    await pollActiveCricketSessions(provider, [{ sessionId: "cricket-good", reason: "test" }], new Map(), new Map());
    expect(provider.callCounts.pollLiveEvents).toBe(1);
  });

  it("budget exhausted (within the safety margin of the daily limit): remaining sessions are skipped, without throwing", async () => {
    const provider = new BudgetReportingFaultyProvider(100 - config.cricketRequestSafetyMarginRequests); // exactly at the margin boundary
    await expect(
      pollActiveCricketSessions(
        provider,
        [
          { sessionId: "cricket-good", reason: "test" },
          { sessionId: "cricket-good", reason: "test" },
        ],
        new Map(),
        new Map(),
      ),
    ).resolves.toBeUndefined();
    expect(provider.callCounts.pollLiveEvents).toBe(0); // skipped before the first session's real request
  });

  it("a provider that doesn't report usage at all (e.g. a plain test double) is never gated — unknown usage is treated as 'proceed', not 'exhausted'", async () => {
    let pollLiveEventsCalls = 0;
    class UnreportingProvider extends FaultyProvider {
      // Deliberately no getRequestBudgetStatus — the "unknown, not exhausted" case under test.
      override async pollLiveEvents(input: { sessionId: string }) {
        pollLiveEventsCalls += 1;
        return super.pollLiveEvents(input);
      }
    }
    await pollActiveCricketSessions(new UnreportingProvider(), [{ sessionId: "cricket-good", reason: "test" }], new Map(), new Map());
    expect(pollLiveEventsCalls).toBe(1); // reached the real poll — not skipped by the budget guard
  });
  });

  describe("runCricketTickOnce — request-budget guard skips the whole tick, not just polling", () => {
  it("under budget: bootstrap and polling both run normally", async () => {
    const provider = new BudgetReportingFaultyProvider(5);
    const state = initialCricketTickState();
    await runCricketTickOnce(provider, state);
    expect(provider.callCounts.getCompetitions).toBe(1); // first tick — metadata TTL forces a bootstrap
    expect(provider.callCounts.pollLiveEvents).toBeGreaterThan(0);
  });

  it("budget exhausted: the entire tick — bootstrap AND polling — is skipped, and the process does not throw", async () => {
    const provider = new BudgetReportingFaultyProvider(100 - config.cricketRequestSafetyMarginRequests);
    const state = initialCricketTickState();
    await expect(runCricketTickOnce(provider, state)).resolves.toBeUndefined();
    expect(provider.callCounts.getCompetitions).toBe(0);
    expect(provider.callCounts.getSeasons).toBe(0);
    expect(provider.callCounts.pollLiveEvents).toBe(0);
  });

  it("recovers on a later tick once usage is no longer reported as exhausted (simulating the next day's reset)", async () => {
    const provider = new BudgetReportingFaultyProvider(100 - config.cricketRequestSafetyMarginRequests);
    const state = initialCricketTickState();
    await runCricketTickOnce(provider, state);
    expect(provider.callCounts.getCompetitions).toBe(0);

    provider.hitsToday = 0; // "next day" — usage reset
    await runCricketTickOnce(provider, state);
    expect(provider.callCounts.getCompetitions).toBe(1);
  });
  });
});
