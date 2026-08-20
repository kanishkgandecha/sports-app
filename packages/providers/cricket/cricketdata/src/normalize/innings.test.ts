import { describe, expect, it } from "vitest";
import { deriveInningsTeamOrder, deriveTarget, normalizeInningsState, normalizeSessions } from "./innings";
import type { CricketDataMatchSummary, CricketDataScorecardBlock } from "../types";
import { buildTeamId } from "../reference";
import currentMatchesFixture from "../fixtures/currentMatches.json";
import inningsBreakInfo from "../fixtures/matchInfo.inningsBreak.json";
import availableScorecard from "../fixtures/matchScorecard.available.json";
import awardedMatchInfo from "../fixtures/matchInfo.awarded.json";

const matches = currentMatchesFixture.data as CricketDataMatchSummary[];
const completedT20 = matches.find((m) => m.id === "793fd4ac-a2ee-4ca7-90ec-63743393d32e")!;
const inningsBreakSummary = matches.find((m) => m.id === "e9d200fb-3c43-4852-9c93-9160517d7b36")!;
// The real match_info detail (has tossWinner/tossChoice + 2 real score entries — the list summary for this same match only had 1).
const inningsBreakMatch = inningsBreakInfo.data as CricketDataMatchSummary;
const awardedMatch = awardedMatchInfo.data as CricketDataMatchSummary;

describe("deriveInningsTeamOrder — real matches", () => {
  it("uses real tossWinner/tossChoice to determine who bats first", () => {
    // Real: tossWinner "vida kovai kings" chose "bowl" — so Chepauk Super Gillies bat first.
    expect(inningsBreakMatch.tossWinner).toBe("vida kovai kings");
    expect(inningsBreakMatch.tossChoice).toBe("bowl");
    const order = deriveInningsTeamOrder(inningsBreakMatch, buildTeamId);
    expect(order[0]).toEqual({
      battingTeamId: buildTeamId("Chepauk Super Gillies"),
      bowlingTeamId: buildTeamId("Vida Kovai Kings"),
    });
  });

  it("alternates batting/bowling teams for the second innings", () => {
    const order = deriveInningsTeamOrder(inningsBreakMatch, buildTeamId);
    expect(order[1]).toEqual({
      battingTeamId: buildTeamId("Vida Kovai Kings"),
      bowlingTeamId: buildTeamId("Chepauk Super Gillies"),
    });
  });

  it("falls back to teams[0] batting first when no real toss info is available (a list summary, not match detail)", () => {
    const order = deriveInningsTeamOrder(completedT20, buildTeamId);
    expect(order[0].battingTeamId).toBe(buildTeamId(completedT20.teams[0]));
  });

  it("returns [] when there are not exactly 2 teams or no score yet", () => {
    expect(deriveInningsTeamOrder({ ...completedT20, score: undefined }, buildTeamId)).toEqual([]);
  });
});

describe("normalizeSessions — real matches", () => {
  it("normalizes one Session per real score[] entry, typed by innings order", () => {
    const sessions = normalizeSessions(inningsBreakMatch);
    expect(sessions.map((s) => s.type)).toEqual(["1ST_INNINGS", "2ND_INNINGS"]);
  });

  it("marks every innings before the last as completed, and the last as live for a real in-progress match", () => {
    const sessions = normalizeSessions(inningsBreakMatch);
    expect(sessions[0].status).toBe("completed");
    expect(sessions[1].status).toBe("live");
  });

  it("marks the last innings as completed for a real finished match, even with matchEnded:false (the awarded case)", () => {
    const sessions = normalizeSessions(awardedMatch);
    expect(sessions.at(-1)?.status).toBe("completed");
  });

  it("marks the captured authoritative Innings Break entry completed, leaving no pollable innings between innings", () => {
    expect(inningsBreakSummary.status).toBe("Innings Break");
    expect(normalizeSessions(inningsBreakSummary)).toMatchObject([{ status: "completed" }]);
  });

  it("keeps an unstarted match's score entry scheduled rather than inventing a live innings", () => {
    const anomalousUpcoming = {
      ...inningsBreakSummary,
      status: "Toss pending",
      matchStarted: false,
      score: [{ r: 0, w: 0, o: 0, inning: "not started" }],
    };
    expect(normalizeSessions(anomalousUpcoming)).toMatchObject([{ status: "scheduled" }]);
  });
});

describe("deriveTarget — scoped to the real 2-innings limited-overs case", () => {
  it("computes a real target and required run rate for the second innings of a real T20", () => {
    // Real: 1st innings 167/10 (19.3 overs); 2nd innings 5/0 (0.3 overs) — target 168, T20 = 20 overs allowed.
    const { target, requiredRunRate } = deriveTarget(inningsBreakMatch, 1);
    expect(target).toBe(168); // 167 + 1
    expect(requiredRunRate).toBe(8.27); // (168-5) runs needed over (20-0.3) overs remaining
  });

  it("returns null/null for the first innings — there is no target yet", () => {
    expect(deriveTarget(inningsBreakMatch, 0)).toEqual({ target: null, requiredRunRate: null });
  });

  it("returns a real target but null requiredRunRate when the format can't be determined", () => {
    const noFormat: CricketDataMatchSummary = { ...inningsBreakMatch, matchType: undefined, name: "Team A vs Team B, Final" };
    const { target, requiredRunRate } = deriveTarget(noFormat, 1);
    expect(target).toBe(168);
    expect(requiredRunRate).toBeNull();
  });

  it("never computes a target for anything other than a 2-innings match (Test cricket's 4-innings target logic is out of scope this checkpoint)", () => {
    const fourInnings: CricketDataMatchSummary = {
      ...inningsBreakMatch,
      score: [
        { r: 300, w: 10, o: 90, inning: "a" },
        { r: 250, w: 10, o: 85, inning: "b" },
        { r: 200, w: 10, o: 80, inning: "c" },
        { r: 100, w: 4, o: 40, inning: "d" },
      ],
    };
    expect(deriveTarget(fourInnings, 1)).toEqual({ target: null, requiredRunRate: null });
    expect(deriveTarget(fourInnings, 3)).toEqual({ target: null, requiredRunRate: null });
  });
});

describe("normalizeInningsState — real match_info + real match_scorecard", () => {
  const order = deriveInningsTeamOrder(inningsBreakMatch, buildTeamId);

  it("normalizes runs/wickets/overs straight from real score[], no scorecard needed", () => {
    const state = normalizeInningsState(inningsBreakMatch, 0, order);
    expect(state).toMatchObject({ runs: 167, wickets: 10, overs: 19.3 });
    expect(state?.strikerId).toBeNull();
    expect(state?.currentBowlerId).toBeNull();
  });

  it("resolves real striker/non-striker from the not-out batsmen in a real scorecard block", () => {
    const scorecardMatch = availableScorecard.data as CricketDataMatchSummary & { scorecard: CricketDataScorecardBlock[] };
    const scorecardOrder = deriveInningsTeamOrder(scorecardMatch, buildTeamId);
    const block = scorecardMatch.scorecard[0];
    const state = normalizeInningsState(scorecardMatch, 0, scorecardOrder, block);
    // Real: "Janet Mbabazi" was the sole not-out batsman in the captured scorecard.
    expect(state?.strikerId).toBe("cricket-player-f6cc2815-be88-4e14-8951-ba9c86ad4572");
  });

  it("returns undefined for an innings index with no real score entry, rather than fabricating a zeroed state", () => {
    expect(normalizeInningsState(inningsBreakMatch, 5, order)).toBeUndefined();
  });
});
