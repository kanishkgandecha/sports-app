import type { Session, SessionStatus } from "@sports/domain";
import type { cricket } from "@sports/domain";
import type { CricketDataMatchSummary, CricketDataScorecardBlock } from "../types";
import { buildFixtureId, buildPlayerId, buildSessionId } from "../reference";
import { deriveFixtureStatus, deriveFormat } from "./fixture";

const SESSION_TYPE_BY_INNINGS: Record<number, cricket.CricketSessionType> = {
  1: "1ST_INNINGS",
  2: "2ND_INNINGS",
  3: "3RD_INNINGS",
  4: "4TH_INNINGS",
};

/**
 * The real `score[].inning` label is NOT a reliable source of which team
 * is batting — verified inconsistent in real data (mixed case, and one
 * real entry literally read `"Papua New Guinea Women,Thailand Women
 * Inning 1"`, both team names concatenated). Derived instead from
 * `tossWinner`/`tossChoice` (only present on `match_info` detail — see
 * types.ts) plus cricket's own alternation rule (teams strictly swap
 * batting/bowling each innings) — real, structured fields, never the
 * free-text label. Falls back to `teams[0]` batting first when toss info
 * isn't available (e.g. normalizing from a list summary, not match
 * detail) — a documented best-effort default, not a guess presented as
 * fact.
 */
export function deriveInningsTeamOrder(
  match: CricketDataMatchSummary,
  resolveTeamId: (teamName: string) => string,
): Array<{ battingTeamId: string; bowlingTeamId: string }> {
  const teamIds = match.teams.map(resolveTeamId);
  const inningsCount = match.score?.length ?? 0;
  if (teamIds.length !== 2 || inningsCount === 0) return [];

  let firstBattingIndex = 0;
  if (match.tossWinner && match.tossChoice) {
    const winnerIndex = match.teams.findIndex((t) => t.toLowerCase() === match.tossWinner?.toLowerCase());
    if (winnerIndex !== -1) {
      const choseToBat = match.tossChoice.toLowerCase() === "bat";
      firstBattingIndex = choseToBat ? winnerIndex : 1 - winnerIndex;
    }
  }

  const order: Array<{ battingTeamId: string; bowlingTeamId: string }> = [];
  for (let i = 0; i < inningsCount; i++) {
    const battingIndex = i % 2 === 0 ? firstBattingIndex : 1 - firstBattingIndex;
    order.push({ battingTeamId: teamIds[battingIndex], bowlingTeamId: teamIds[1 - battingIndex] });
  }
  return order;
}

/**
 * Every entry before the last in `score[]` is necessarily over (a new
 * innings entry only appears once the previous one ends) — verified: a
 * real match's `score[]` grew a second entry the moment the first
 * innings's `w` reached 10, never before. The last entry's status follows
 * the match's own derived status.
 */
function deriveSessionStatus(fixtureStatus: ReturnType<typeof deriveFixtureStatus>, isLastInnings: boolean): SessionStatus {
  if (!isLastInnings) return "completed";
  if (fixtureStatus === "completed") return "completed";
  if (fixtureStatus === "cancelled" || fixtureStatus === "postponed") return "cancelled";
  return "live";
}

export function normalizeSessions(match: CricketDataMatchSummary): Session[] {
  const fixtureId = buildFixtureId(match.id);
  const fixtureStatus = deriveFixtureStatus(match);
  const entries = match.score ?? [];

  return entries.map((_entry, index) => {
    const innings = index + 1;
    return {
      id: buildSessionId(match.id, innings),
      fixtureId,
      // Falls back to a generic label past the 4th innings rather than
      // throwing — never observed in real data (no format has more than
      // 4), but a malformed/unexpected response shouldn't crash ingestion
      // over it (same resilience posture as OpenF1Adapter's
      // mapSessionType fallback).
      type: SESSION_TYPE_BY_INNINGS[innings] ?? `INNINGS_${innings}`,
      status: deriveSessionStatus(fixtureStatus, index === entries.length - 1),
      // No per-innings start time in this provider's data — the match's
      // own start time is reused for every innings, a documented
      // limitation (see docs/CONTEXT.md), not a fabricated per-innings
      // timestamp.
      startTime: `${match.dateTimeGMT}Z`,
      endTime: null,
    };
  });
}

/** Format-specific overs allowed — a well-known, fixed cricket rule (not provider data), used only to compute `requiredRunRate`. Test cricket has no overs limit, so target/RRR are intentionally left unset for it (§ normalizeInningsState's doc comment). */
const OVERS_ALLOWED: Partial<Record<cricket.CricketFormat, number>> = { T20: 20, ODI: 50 };

/**
 * `target`/`requiredRunRate` are DERIVED (see @sports/domain's
 * `CricketInningsState` doc comment) — and scoped deliberately narrowly:
 * only computed for the *second* innings of a 2-innings (ODI/T20) match,
 * the one case this checkpoint's real samples actually confirmed is
 * unambiguous (`target` = first innings total + 1, `requiredRunRate` =
 * runs still needed ÷ overs remaining in the format's allowed overs).
 * Test cricket's 4-innings target logic (a genuinely different, more
 * complex calculation — the team batting last chases the *combined*
 * deficit across both of the other team's innings) is real but was never
 * exercised by any real sample this checkpoint captured (every match
 * sampled was T20/ODI) — left `null` rather than implemented against
 * unverified assumptions, per this checkpoint's "no speculative fields"
 * rule.
 */
export function deriveTarget(
  match: CricketDataMatchSummary,
  inningsIndex: number,
): { target: number | null; requiredRunRate: number | null } {
  const entries = match.score ?? [];
  if (inningsIndex !== 1 || entries.length !== 2) return { target: null, requiredRunRate: null };

  const target = entries[0].r + 1;
  const format = deriveFormat(match);
  const oversAllowed = format ? OVERS_ALLOWED[format] : undefined;
  if (oversAllowed === undefined) return { target, requiredRunRate: null };

  const current = entries[1];
  const runsNeeded = target - current.r;
  const oversRemaining = oversAllowed - current.o;
  const requiredRunRate = oversRemaining > 0 && runsNeeded > 0 ? Number((runsNeeded / oversRemaining).toFixed(2)) : null;
  return { target, requiredRunRate };
}

export function normalizeInningsState(
  match: CricketDataMatchSummary,
  inningsIndex: number,
  teamOrder: Array<{ battingTeamId: string; bowlingTeamId: string }>,
  scorecardBlock?: CricketDataScorecardBlock,
): cricket.CricketInningsState | undefined {
  const entry = match.score?.[inningsIndex];
  const teams = teamOrder[inningsIndex];
  if (!entry || !teams) return undefined;

  const { target, requiredRunRate } = deriveTarget(match, inningsIndex);

  // Not-out batsmen (no `dismissal` field — verified real: the sole
  // not-out entry in a real scorecard had no `dismissal`/`bowler`/
  // `catcher`, only `dismissal-text: "not out"`) are the current
  // striker/non-striker. Order in the array reflects batting order, not
  // strike — real data has no explicit "on strike" flag, so which of the
  // two not-out batsmen is *currently* on strike genuinely isn't
  // determinable from this endpoint; both are surfaced, arbitrarily
  // ordered, rather than guessing which is which.
  const notOut = scorecardBlock?.batting.filter((b) => !b.dismissal) ?? [];
  const currentBowler = scorecardBlock?.bowling.at(-1);

  return {
    id: `cricket-innings-state-${buildSessionId(match.id, inningsIndex + 1)}`,
    sessionId: buildSessionId(match.id, inningsIndex + 1),
    battingTeamId: teams.battingTeamId,
    bowlingTeamId: teams.bowlingTeamId,
    runs: entry.r,
    wickets: entry.w,
    overs: entry.o,
    strikerId: notOut[0] ? buildPlayerId(notOut[0].batsman.id) : null,
    nonStrikerId: notOut[1] ? buildPlayerId(notOut[1].batsman.id) : null,
    currentBowlerId: currentBowler ? buildPlayerId(currentBowler.bowler.id) : null,
    target,
    requiredRunRate,
  };
}
