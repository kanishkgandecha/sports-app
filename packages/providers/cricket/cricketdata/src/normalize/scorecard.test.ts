import { describe, expect, it } from "vitest";
import { normalizeBattingFigures, normalizeBowlingFigures } from "./scorecard";
import type { CricketDataMatchSummary, CricketDataScorecardBlock } from "../types";
import availableScorecard from "../fixtures/matchScorecard.available.json";

const scorecardMatch = availableScorecard.data as CricketDataMatchSummary & { scorecard: CricketDataScorecardBlock[] };
const block = scorecardMatch.scorecard[0];
const SESSION_ID = "cricket-match-1fa3bd8a-4bac-4ebb-b022-aba8281467e3-innings-1";

describe("normalizeBattingFigures — real match_scorecard batting entries", () => {
  it("normalizes every real batting entry, including the not-out one", () => {
    const figures = normalizeBattingFigures(block, SESSION_ID);
    expect(figures).toHaveLength(block.batting.length);
    const janet = figures.find((f) => f.playerId === "cricket-player-f6cc2815-be88-4e14-8951-ba9c86ad4572");
    expect(janet).toMatchObject({ runs: 57, balls: 44, fours: 4, sixes: 2, strikeRate: 129.55, dismissalText: "not out" });
  });

  it("carries the real, verbatim dismissal-text for a dismissed batsman, not a re-derived summary", () => {
    const figures = normalizeBattingFigures(block, SESSION_ID);
    const stephani = figures.find((f) => f.playerId === "cricket-player-8ef46d4e-e7c8-4a87-be31-4689f42b8301");
    expect(stephani?.dismissalText).toBe("run out (Neema Pius)");
  });

  it("preserves real batting order as the array index", () => {
    const figures = normalizeBattingFigures(block, SESSION_ID);
    expect(figures.map((f) => f.battingOrder)).toEqual(figures.map((_, i) => i));
  });

  it("builds real, stable, deterministic ids (idempotent re-processing)", () => {
    const a = normalizeBattingFigures(block, SESSION_ID);
    const b = normalizeBattingFigures(block, SESSION_ID);
    expect(a.map((f) => f.id)).toEqual(b.map((f) => f.id));
  });
});

describe("normalizeBowlingFigures — real match_scorecard bowling entries", () => {
  it("normalizes every real bowling entry", () => {
    const figures = normalizeBowlingFigures(block, SESSION_ID);
    expect(figures).toHaveLength(block.bowling.length);
    const agnes = figures.find((f) => f.playerId === "cricket-player-0490410f-92de-43e4-8da8-2d07de8f1fbd");
    expect(agnes).toMatchObject({ overs: 2, maidens: 0, runsConceded: 7, wickets: 0, economy: 3.5 });
  });

  it("preserves real bowling order as the array index", () => {
    const figures = normalizeBowlingFigures(block, SESSION_ID);
    expect(figures.map((f) => f.bowlingOrder)).toEqual(figures.map((_, i) => i));
  });

  it("never fabricates an extras/totals-derived field — this type has none, matching the real, verified-empty scorecard data", () => {
    const figures = normalizeBowlingFigures(block, SESSION_ID);
    for (const figure of figures) {
      expect(Object.keys(figure).sort()).toEqual(
        ["bowlingOrder", "economy", "id", "maidens", "overs", "playerId", "runsConceded", "sessionId", "wickets"].sort(),
      );
    }
  });
});
