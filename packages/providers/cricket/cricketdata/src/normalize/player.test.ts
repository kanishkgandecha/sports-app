import { describe, expect, it } from "vitest";
import { normalizePlayersFromScorecard } from "./player";
import type { CricketDataMatchSummary, CricketDataScorecardBlock } from "../types";
import availableScorecard from "../fixtures/matchScorecard.available.json";
import { buildTeamId } from "../reference";

const scorecardMatch = availableScorecard.data as CricketDataMatchSummary & { scorecard: CricketDataScorecardBlock[] };
const block = scorecardMatch.scorecard[0];
const teams = { battingTeamId: buildTeamId("Uganda Women"), bowlingTeamId: buildTeamId("Tanzania Women") };

describe("normalizePlayersFromScorecard — real scorecard batting/bowling/catching entries", () => {
  it("assigns batsmen to the batting team, never the bowling team", () => {
    const players = normalizePlayersFromScorecard(block, teams);
    const janet = players.find((p) => p.name === "Janet Mbabazi");
    expect(janet?.teamId).toBe(teams.battingTeamId);
  });

  it("assigns bowlers to the bowling team, never the batting team — the real bug this function's doc comment exists to prevent", () => {
    const players = normalizePlayersFromScorecard(block, teams);
    const bowler = players.find((p) => p.name === "Agnes Qwele");
    expect(bowler?.teamId).toBe(teams.bowlingTeamId);
  });

  it("never fabricates role/shortName/avatarUrl — this provider gives none", () => {
    const players = normalizePlayersFromScorecard(block, teams);
    expect(players.every((p) => p.role === null && p.shortName === null && p.avatarUrl === null)).toBe(true);
  });

  it("dedupes a player who appears in both batting and catching (a fielder who also batted)", () => {
    const players = normalizePlayersFromScorecard(block, teams);
    const ids = players.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds real, stable player ids directly from the provider's own player id", () => {
    const players = normalizePlayersFromScorecard(block, teams);
    const janet = players.find((p) => p.name === "Janet Mbabazi");
    expect(janet?.id).toBe("cricket-player-f6cc2815-be88-4e14-8951-ba9c86ad4572");
  });
});
