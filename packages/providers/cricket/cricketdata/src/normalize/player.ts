import type { Player } from "@sports/domain";
import type { CricketDataPlayerRef, CricketDataScorecardBlock } from "../types";
import { CRICKET_SPORT_ID, buildPlayerId } from "../reference";

/**
 * Cricket has no dedicated roster/squad endpoint reliably available on
 * this tier — verified real: `hasSquad: false` on every match sampled
 * this checkpoint. Players are normalized incrementally FROM
 * `match_scorecard`'s batting/bowling entries as they appear, the only
 * place this provider actually names individual players — a genuinely
 * different roster-bootstrap shape from F1 (OpenF1 gives a full driver
 * list upfront via `/drivers`), disclosed here rather than forced into
 * the same pattern.
 *
 * `role`/`shortName`/`avatarUrl` are always `null` — this provider's
 * player references (`{id, name, cricbuzz_id}`) carry none of them; never
 * fabricated.
 */
export function normalizePlayersFromScorecard(
  block: CricketDataScorecardBlock,
  teams: { battingTeamId: string; bowlingTeamId: string },
): Player[] {
  // `batting[]` is the batting side; `bowling[]`/`catching[]` are the
  // fielding (bowling) side — a real distinction this function must
  // respect, not just "everyone in this block is on one team."
  const byId = new Map<string, { ref: CricketDataPlayerRef; teamId: string }>();
  for (const entry of block.batting) {
    byId.set(entry.batsman.id, { ref: entry.batsman, teamId: teams.battingTeamId });
  }
  for (const entry of block.bowling) {
    byId.set(entry.bowler.id, { ref: entry.bowler, teamId: teams.bowlingTeamId });
  }
  for (const entry of block.catching) {
    // A fielder only ever appears here for a dismissal they were involved
    // in — already on the fielding side by definition, consistent with
    // `bowling[]` above (never overwrites a batting-side assignment,
    // since a fielder is never also this innings' batsman).
    if (!byId.has(entry.catcher.id)) byId.set(entry.catcher.id, { ref: entry.catcher, teamId: teams.bowlingTeamId });
  }

  return [...byId.values()].map(({ ref, teamId }) => ({
    id: buildPlayerId(ref.id),
    sportId: CRICKET_SPORT_ID,
    teamId,
    name: ref.name,
    role: null,
    shortName: null,
    avatarUrl: null,
  }));
}
