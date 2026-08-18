import type { cricket } from "@sports/domain";
import type { CricketDataScorecardBlock } from "../types";
import { buildPlayerId } from "../reference";

/**
 * Cricket Checkpoint 2 — the batting scorecard/bowling figures API+UI
 * deliverable. Maps directly from `match_scorecard`'s real, verified
 * `batting[]`/`bowling[]` entries (Checkpoint 1 §1) — every field here was
 * confirmed present and populated on a real captured scorecard block.
 * `battingOrder`/`bowlingOrder` are the entry's real position in the
 * provider's own array — used for display ordering, not re-derived from
 * anything.
 */
export function normalizeBattingFigures(block: CricketDataScorecardBlock, sessionId: string): cricket.CricketBattingFigure[] {
  return block.batting.map((entry, index) => ({
    id: `cricket-batting-${sessionId}-${entry.batsman.id}`,
    sessionId,
    playerId: buildPlayerId(entry.batsman.id),
    battingOrder: index,
    runs: entry.r,
    balls: entry.b,
    fours: entry["4s"],
    sixes: entry["6s"],
    strikeRate: entry.sr,
    dismissalText: entry["dismissal-text"],
  }));
}

export function normalizeBowlingFigures(block: CricketDataScorecardBlock, sessionId: string): cricket.CricketBowlingFigure[] {
  return block.bowling.map((entry, index) => ({
    id: `cricket-bowling-${sessionId}-${entry.bowler.id}`,
    sessionId,
    playerId: buildPlayerId(entry.bowler.id),
    bowlingOrder: index,
    overs: entry.o,
    maidens: entry.m,
    runsConceded: entry.r,
    wickets: entry.w,
    economy: entry.eco,
  }));
}
