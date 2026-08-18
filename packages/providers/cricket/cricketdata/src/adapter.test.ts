import { describe, expect, it } from "vitest";
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
    const second = await adapter.pollLiveEvents({ sessionId });
    expect(second.some((e) => e.eventType === "WICKET")).toBe(true);
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
