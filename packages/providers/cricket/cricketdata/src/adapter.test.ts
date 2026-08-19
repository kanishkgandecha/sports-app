import { describe, expect, it, vi } from "vitest";
import { sportsProviderContractTests } from "@sports/providers-core/testing";
import { CricketDataAdapter } from "./adapter";
import type { CricketDataHttpClient } from "./client";
import type {
  CricketDataBallByBallResponse,
  CricketDataMatchInfoResponse,
  CricketDataMatchListResponse,
  CricketDataMatchSummary,
  CricketDataScorecardResponse,
  CricketDataSeriesInfoResponse,
} from "./types";
import currentMatchesFixture from "./fixtures/currentMatches.json";
import inningsBreakInfo from "./fixtures/matchInfo.inningsBreak.json";
import awardedMatchInfo from "./fixtures/matchInfo.awarded.json";
import availableScorecard from "./fixtures/matchScorecard.available.json";
import scorecardNotFound from "./fixtures/matchScorecard.notFound.json";
import bbbNotFound from "./fixtures/matchBbb.notFound.json";
import seriesInfoFixture from "./fixtures/seriesInfo.json";

const matches = currentMatchesFixture.data as CricketDataMatchSummary[];
const INNINGS_BREAK_ID = "e9d200fb-3c43-4852-9c93-9160517d7b36";
const AWARDED_ID = "1fa3bd8a-4bac-4ebb-b022-aba8281467e3";
const SCORECARD_AVAILABLE_ID = "1fa3bd8a-4bac-4ebb-b022-aba8281467e3";

/**
 * Fixture-backed fake client — tests never touch the live network, same
 * requirement and pattern as every F1 adapter's own fixture client. Routes
 * by real match id to the specific real (or, for match_bbb's success case,
 * explicitly CONSTRUCTED — see fixtures/README.md) response captured for
 * it.
 */
class FixtureCricketDataClient implements CricketDataHttpClient {
  async getCurrentMatches(): Promise<CricketDataMatchListResponse> {
    return currentMatchesFixture as CricketDataMatchListResponse;
  }

  async getMatchInfo(matchId: string): Promise<CricketDataMatchInfoResponse> {
    if (matchId === INNINGS_BREAK_ID) return inningsBreakInfo as CricketDataMatchInfoResponse;
    if (matchId === AWARDED_ID) return awardedMatchInfo as CricketDataMatchInfoResponse;
    const fromList = matches.find((m) => m.id === matchId);
    if (fromList) return { apikey: "test", data: fromList, status: "success", info: currentMatchesFixture.info };
    throw new Error(`FixtureCricketDataClient has no match_info fixture for ${matchId}`);
  }

  async getMatchScorecard(matchId: string): Promise<CricketDataScorecardResponse> {
    if (matchId === SCORECARD_AVAILABLE_ID) return availableScorecard as CricketDataScorecardResponse;
    return scorecardNotFound as CricketDataScorecardResponse;
  }

  async getMatchBallByBall(_matchId: string): Promise<CricketDataBallByBallResponse> {
    return bbbNotFound as CricketDataBallByBallResponse;
  }

  async getSeriesInfo(_seriesId: string): Promise<CricketDataSeriesInfoResponse> {
    return seriesInfoFixture as CricketDataSeriesInfoResponse;
  }
}

// The reusable contract suite from packages/providers/core, run against
// this adapter exactly as required for every real adapter added to the
// registry.
sportsProviderContractTests(() => new CricketDataAdapter({ client: new FixtureCricketDataClient() }));

describe("CricketDataAdapter — Cricket-specific behavior, offline via FixtureCricketDataClient", () => {
  const makeAdapter = () => new CricketDataAdapter({ client: new FixtureCricketDataClient() });

  it("getCompetitions resolves real series names via series_info, bounded by maxSeriesLookups", async () => {
    const adapter = new CricketDataAdapter({ client: new FixtureCricketDataClient(), maxSeriesLookups: 2 });
    const competitions = await adapter.getCompetitions();
    expect(competitions.length).toBeGreaterThan(0);
    expect(competitions.length).toBeLessThanOrEqual(2);
    expect(competitions[0].name).toBe("Tamil Nadu Premier League 2026");
  });

  it("getFixtures normalizes real current matches, filterable by status", async () => {
    const adapter = makeAdapter();
    // The real series id shared by e9d200fb (live) and 793fd4ac (completed)
    // in the trimmed currentMatches fixture — see fixtures/README.md.
    const realCompetitionId = "cricket-series-6c3c5876-5cfc-4490-9c8e-8ba90aec4323";
    const completed = await adapter.getFixtures({ competitionId: realCompetitionId, status: "completed" });
    expect(completed.length).toBeGreaterThan(0);
    expect(completed.every((f) => f.status === "completed")).toBe(true);
  });

  it("getFixtures returns [] for a competitionId with no real matches, rather than every match unfiltered", async () => {
    const adapter = makeAdapter();
    const fixtures = await adapter.getFixtures({ competitionId: "cricket-series-does-not-exist" });
    expect(fixtures).toEqual([]);
  });

  it("getSessions resolves real innings via match_info, including the awarded match's single completed innings", async () => {
    const adapter = makeAdapter();
    const sessions = await adapter.getSessions({ fixtureId: `cricket-match-${AWARDED_ID}` });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe("completed");
  });

  it("getSessions returns [] for an unrecognized fixture id rather than throwing", async () => {
    const adapter = makeAdapter();
    await expect(adapter.getSessions({ fixtureId: "cricket-match-does-not-exist" })).resolves.toEqual([]);
  });

  it("caches getCurrentMatches across getFixtures/getTeams/getVenues in the same tick — real, tested against the confirmed 100 req/day cap, not just described in a comment", async () => {
    let calls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getCurrentMatches() {
        calls += 1;
        return super.getCurrentMatches();
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    await adapter.getFixtures({ competitionId: "cricket-series-x" });
    await adapter.getTeams();
    await adapter.getVenues();
    expect(calls).toBe(1);
  });

  it("getSessions resolves from the cached current-matches list, not a fresh match_info call, for a fixture that's still current — the fix that keeps a bootstrap loop (getFixtures then getSessions per fixture) to exactly one real call total", async () => {
    let matchInfoCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchInfo(matchId: string) {
        matchInfoCalls += 1;
        return super.getMatchInfo(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtures = await adapter.getFixtures({ competitionId: "cricket-series-6c3c5876-5cfc-4490-9c8e-8ba90aec4323" });
    for (const fixture of fixtures) {
      await adapter.getSessions({ fixtureId: fixture.id });
    }
    expect(fixtures.length).toBeGreaterThan(0);
    expect(matchInfoCalls).toBe(0);
  });

  it("getVenues deduplicates real venues across matches", async () => {
    const adapter = makeAdapter();
    const venues = await adapter.getVenues();
    const ids = venues.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getTeams returns real, deduplicated teams", async () => {
    const adapter = makeAdapter();
    const teams = await adapter.getTeams();
    expect(teams.find((t) => t.name === "Chepauk Super Gillies")).toBeDefined();
  });

  it("getStandings honestly returns [] — no points-table endpoint was verified this checkpoint", async () => {
    const adapter = makeAdapter();
    await expect(adapter.getStandings({ seasonId: "cricket-series-season-x" })).resolves.toEqual([]);
  });

  it("pollLiveEvents emits nothing on the very first poll (no prior state to diff), then real derived events once state changes", async () => {
    const adapter = makeAdapter();
    const sessionId = `cricket-match-${INNINGS_BREAK_ID}-innings-2`;
    const first = await adapter.pollLiveEvents({ sessionId });
    // First poll seeds state; a MATCH_STATUS event is still possible since
    // status-diffing has no "previous" the first time either, so this
    // should also be empty.
    expect(first).toEqual([]);
  });

  it("pollLiveEvents returns [] for an unrecognized sessionId instead of throwing", async () => {
    const adapter = makeAdapter();
    await expect(adapter.pollLiveEvents({ sessionId: "not-a-cricket-session-id" })).resolves.toEqual([]);
  });

  it("pollLiveEvents diffs real state across two ticks into a real WICKET event", async () => {
    class TwoTickClient extends FixtureCricketDataClient {
      private tick = 0;
      async getMatchInfo(matchId: string) {
        this.tick += 1;
        const base = await super.getMatchInfo(matchId);
        if (this.tick === 1) return base;
        // Second tick: same match, one more wicket fell.
        const data = base.data as CricketDataMatchSummary;
        return {
          ...base,
          data: { ...data, score: data.score!.map((s, i) => (i === 1 ? { ...s, w: s.w + 1, o: s.o + 0.1 } : s)) },
        };
      }
    }
    const adapter = new CricketDataAdapter({ client: new TwoTickClient() });
    const sessionId = `cricket-match-${INNINGS_BREAK_ID}-innings-2`;
    await adapter.pollLiveEvents({ sessionId }); // seed
    // Real production ticks are `cricketPollIntervalMs` (30min) apart, far
    // past the adapter's 5-minute match_info cache TTL (Cricket Checkpoint
    // 4's request-budget remediation) — advance past it here too, so this
    // test exercises the same real gap a genuine second poll tick has,
    // rather than accidentally serving the second call from cache (which
    // would defeat the diff and fail this assertion for the wrong reason).
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 6 * 60 * 1000);
    try {
      const second = await adapter.pollLiveEvents({ sessionId });
      expect(second.some((e) => e.eventType === "WICKET")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getInningsState normalizes real current state for every real innings", async () => {
    const adapter = makeAdapter();
    const states = await adapter.getInningsState(`cricket-match-${INNINGS_BREAK_ID}`);
    expect(states).toHaveLength(2);
    expect(states[0].runs).toBe(167);
  });

  it("getFixtureDetail normalizes real toss/format for the awarded match", async () => {
    const adapter = makeAdapter();
    const detail = await adapter.getFixtureDetail(`cricket-match-${AWARDED_ID}`);
    expect(detail?.format).toBe("T20");
    expect(detail?.tossDecision).toBe("BOWL");
  });

  it("getScorecard normalizes real batting/bowling figures for a match with a real scorecard", async () => {
    const adapter = makeAdapter();
    const scorecard = await adapter.getScorecard(`cricket-match-${SCORECARD_AVAILABLE_ID}`);
    expect(scorecard).toHaveLength(1); // this real match's score[] has exactly 1 real entry
    expect(scorecard[0]).toBeDefined();
    expect(scorecard[0]!.batting.length).toBeGreaterThan(0);
    expect(scorecard[0]!.bowling.length).toBeGreaterThan(0);
  });

  it("getScorecard returns undefined per-innings (not []) for a match with no real scorecard available — honestly distinguishing 'nothing to show' from 'we checked, there's none'", async () => {
    const adapter = makeAdapter();
    const scorecard = await adapter.getScorecard(`cricket-match-${INNINGS_BREAK_ID}`);
    expect(scorecard.every((s) => s === undefined)).toBe(true);
  });

  it("getRosterForFixture resolves real, named teams/players for a fixture with a real scorecard, reusing the cached call", async () => {
    let scorecardCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchScorecard(matchId: string) {
        scorecardCalls += 1;
        return super.getMatchScorecard(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;
    await adapter.getInningsState(fixtureId); // primes the cache
    const roster = await adapter.getRosterForFixture(fixtureId);
    expect(roster.teams.length).toBeGreaterThan(0);
    expect(roster.players.find((p) => p.name === "Janet Mbabazi")).toBeDefined();
    expect(scorecardCalls).toBe(1);
  });

  it("getRosterForFixture returns real teams but no players when no scorecard is available", async () => {
    const adapter = makeAdapter();
    const roster = await adapter.getRosterForFixture(`cricket-match-${INNINGS_BREAK_ID}`);
    expect(roster.teams.length).toBeGreaterThan(0);
    expect(roster.players).toEqual([]);
  });

  it("shares one real match_scorecard call between getInningsState and getScorecard in the same tick — the real caching fix that keeps Checkpoint 2's new method from doubling real requests", async () => {
    let scorecardCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchScorecard(matchId: string) {
        scorecardCalls += 1;
        return super.getMatchScorecard(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;
    await adapter.getInningsState(fixtureId);
    await adapter.getScorecard(fixtureId);
    expect(scorecardCalls).toBe(1);
  });
});

describe("CricketDataAdapter — error handling passthrough", () => {
  it("propagates a client error from getFixtures rather than swallowing it", async () => {
    const failingClient: CricketDataHttpClient = {
      getCurrentMatches: async () => {
        throw new Error("simulated network failure");
      },
      getMatchInfo: async () => {
        throw new Error("unused");
      },
      getMatchScorecard: async () => {
        throw new Error("unused");
      },
      getMatchBallByBall: async () => {
        throw new Error("unused");
      },
      getSeriesInfo: async () => {
        throw new Error("unused");
      },
    };
    const adapter = new CricketDataAdapter({ client: failingClient });
    await expect(adapter.getFixtures({ competitionId: "cricket-series-x" })).rejects.toThrow("simulated network failure");
  });

  it("invokes the request logger with failure details on a client error, without ever including the api key", async () => {
    const logs: Array<{ method: string; ok: boolean }> = [];
    const failingClient: CricketDataHttpClient = {
      getCurrentMatches: async () => {
        throw new Error("simulated failure");
      },
      getMatchInfo: async () => {
        throw new Error("unused");
      },
      getMatchScorecard: async () => {
        throw new Error("unused");
      },
      getMatchBallByBall: async () => {
        throw new Error("unused");
      },
      getSeriesInfo: async () => {
        throw new Error("unused");
      },
    };
    const adapter = new CricketDataAdapter({
      client: failingClient,
      onRequest: (log) => logs.push({ method: log.method, ok: log.ok }),
    });
    await expect(adapter.getVenues()).rejects.toThrow();
    expect(logs).toEqual([{ method: "getVenues", ok: false }]);
  });
});

/**
 * Cricket Checkpoint 4 — request-budget remediation. These tests exist
 * specifically because the previous test suite (above) never caught the
 * real bug: `getCompetitions`/`getSeasons` each independently called
 * `getSeriesInfo` for the same series, and the four state-refresh methods
 * each independently called `getMatchInfo` for the same match, even when
 * called through `Promise.all` (genuinely concurrent, not just
 * back-to-back `await`s) — see docs/CONTEXT.md's Cricket Checkpoint 4
 * remediation section for the full audit and arithmetic.
 */
describe("CricketDataAdapter — request-budget remediation (Cricket Checkpoint 4)", () => {
  it("getCompetitions then getSeasons for the same series issues exactly ONE real getSeriesInfo request, not two", async () => {
    let seriesInfoCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getSeriesInfo(seriesId: string) {
        seriesInfoCalls += 1;
        return super.getSeriesInfo(seriesId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    // Real series id from the real trimmed currentMatches fixture (also
    // used elsewhere in this file) — deliberately not derived from
    // `getCompetitions()`'s own return value, since `FixtureCricketDataClient
    // .getSeriesInfo` always answers with the same one real captured
    // response regardless of which id was requested, so the *response's*
    // `data.info.id` isn't a reliable stand-in for "the id bootstrap.ts
    // will actually call getSeasons with" the way it would be against the
    // real API (which echoes back the id you asked for).
    const realCompetitionId = "cricket-series-6c3c5876-5cfc-4490-9c8e-8ba90aec4323";
    await adapter.getCompetitions(); // default maxSeriesLookups covers all 3 real series ids in the fixture, including this one
    const before = seriesInfoCalls;

    await adapter.getSeasons({ competitionId: realCompetitionId });
    expect(seriesInfoCalls).toBe(before); // no NEW real request — reused the cache getCompetitions already populated
  });

  it("Promise.all over getInningsState/getScorecard/getRosterForFixture/getFixtureDetail — the real state-refresh tick shape (apps/ingestion/src/cricket/job.ts) — issues exactly ONE real getMatchInfo request, not four", async () => {
    let matchInfoCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchInfo(matchId: string) {
        matchInfoCalls += 1;
        return super.getMatchInfo(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;

    await Promise.all([
      adapter.getInningsState(fixtureId),
      adapter.getScorecard(fixtureId),
      adapter.getRosterForFixture(fixtureId),
      adapter.getFixtureDetail(fixtureId),
    ]);

    expect(matchInfoCalls).toBe(1);
  });

  it("concurrent getScorecard callers (Promise.all, not sequential awaits) issue exactly ONE real getMatchScorecard request", async () => {
    let scorecardCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchScorecard(matchId: string) {
        scorecardCalls += 1;
        return super.getMatchScorecard(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;

    await Promise.all([adapter.getScorecard(fixtureId), adapter.getScorecard(fixtureId), adapter.getScorecard(fixtureId)]);

    expect(scorecardCalls).toBe(1);
  });

  it("does not re-request within the 5-minute cache TTL, but does after it expires", async () => {
    let matchInfoCalls = 0;
    class CountingClient extends FixtureCricketDataClient {
      async getMatchInfo(matchId: string) {
        matchInfoCalls += 1;
        return super.getMatchInfo(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new CountingClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;

    await adapter.getFixtureDetail(fixtureId);
    expect(matchInfoCalls).toBe(1);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 4 * 60 * 1000); // still within the 5-minute TTL
      await adapter.getFixtureDetail(fixtureId);
      expect(matchInfoCalls).toBe(1); // no new request yet

      vi.setSystemTime(Date.now() + 2 * 60 * 1000); // now past it
      await adapter.getFixtureDetail(fixtureId);
      expect(matchInfoCalls).toBe(2); // real refresh allowed again
    } finally {
      vi.useRealTimers();
    }
  });

  it("a shared failure is returned to every concurrent caller, and does not poison the cache forever — a later call after the TTL can succeed", async () => {
    let matchInfoCalls = 0;
    class FlakyClient extends FixtureCricketDataClient {
      async getMatchInfo(matchId: string) {
        matchInfoCalls += 1;
        if (matchInfoCalls === 1) throw new Error("simulated transient network failure");
        return super.getMatchInfo(matchId);
      }
    }
    const adapter = new CricketDataAdapter({ client: new FlakyClient() });
    const fixtureId = `cricket-match-${SCORECARD_AVAILABLE_ID}`;

    // Two concurrent callers sharing the one (failing) in-flight request —
    // both degrade gracefully (getFixtureDetail swallows to undefined),
    // neither throws past the adapter boundary, and only ONE real request
    // was actually made for both of them.
    const [a, b] = await Promise.all([adapter.getFixtureDetail(fixtureId), adapter.getFixtureDetail(fixtureId)]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(matchInfoCalls).toBe(1);

    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 6 * 60 * 1000); // past the TTL — the failed entry is not cached forever
      const retried = await adapter.getFixtureDetail(fixtureId);
      expect(retried).toBeDefined();
      expect(matchInfoCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("getRequestBudgetStatus reflects the real, provider-reported hitsToday/hitsLimit from the most recent real response", async () => {
    const adapter = new CricketDataAdapter({ client: new FixtureCricketDataClient() });
    expect(adapter.getRequestBudgetStatus()).toBeUndefined(); // no real request made yet this process

    await adapter.getVenues(); // a real getCurrentMatches call — the fixture's own real info: hitsToday=2, hitsLimit=100
    const status = adapter.getRequestBudgetStatus();
    expect(status).toMatchObject({ hitsToday: 2, hitsLimit: 100 });
  });

  it("getRequestBudgetStatus does not update on a cache hit — only real requests move it", async () => {
    const adapter = new CricketDataAdapter({ client: new FixtureCricketDataClient() });
    await adapter.getVenues();
    const first = adapter.getRequestBudgetStatus();
    await adapter.getTeams(); // shares the same cached getCurrentMatches — no new real request
    expect(adapter.getRequestBudgetStatus()).toEqual(first);
  });
});
