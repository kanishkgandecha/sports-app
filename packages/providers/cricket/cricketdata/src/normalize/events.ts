import type { LiveEvent } from "@sports/domain";
import type { cricket } from "@sports/domain";
import type { CricketDataBallByBallResponse, CricketDataMatchSummary, CricketDataScoreEntry } from "../types";
import { CRICKET_SPORT_ID, buildPlayerId } from "../reference";

/**
 * djb2-style hash — same algorithm and reasoning as OpenF1Adapter's
 * `deterministicHash` (packages/providers/f1/openf1/src/reference.ts):
 * cricket's `status` free text has no natural unique key of its own, and
 * this gives the same input the same LiveEvent id every time (idempotent
 * re-ingestion) without external counter state. Not extracted into a
 * shared package — see reference.ts's doc comment on why no
 * `packages/providers/cricket/shared` exists yet.
 */
function deterministicHash(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * The reliable path that actually keeps `LiveEvent` populated today: diffs
 * two consecutive `score[]` snapshots for the same innings and emits a
 * real, derived event when something changed — the same "diff consecutive
 * polls into LiveEvents" technique OpenF1Adapter already uses for F1's
 * position stream (`diffPosition`), applied here because true ball-by-ball
 * (`match_bbb`) was verified unavailable for every real match sampled this
 * checkpoint (see adapter.ts's doc comment) — this is what's actually
 * real and available, not a fallback for a hypothetical.
 *
 * `previous === undefined` (first poll ever seeing this innings) emits
 * nothing — there's no real "change" to report yet, matching
 * OpenF1Adapter's own first-poll seeding behavior.
 */
export function diffInningsScore(
  previous: CricketDataScoreEntry | undefined,
  current: CricketDataScoreEntry,
  input: { sessionId: string; timestamp: string; dismissalText: string | null },
): LiveEvent[] {
  if (!previous) return [];
  if (previous.r === current.r && previous.w === current.w && previous.o === current.o) return [];

  if (current.w > previous.w) {
    const payload: cricket.WicketPayload = {
      wickets: current.w,
      overs: current.o,
      dismissalText: input.dismissalText,
    };
    return [
      {
        id: `cricket-wicket-${input.sessionId}-${current.w}`,
        sportId: CRICKET_SPORT_ID,
        sessionId: input.sessionId,
        eventType: "WICKET",
        timestamp: input.timestamp,
        source: "cricketdata",
        payload: payload as unknown as Record<string, unknown>,
      },
    ];
  }

  const payload: cricket.ScoreUpdatePayload = {
    runs: current.r,
    wickets: current.w,
    overs: current.o,
    deltaRuns: current.r - previous.r,
    deltaWickets: current.w - previous.w,
  };
  return [
    {
      id: `cricket-score-${input.sessionId}-${current.r}-${current.w}-${current.o}`,
      sportId: CRICKET_SPORT_ID,
      sessionId: input.sessionId,
      eventType: "SCORE_UPDATE",
      timestamp: input.timestamp,
      source: "cricketdata",
      payload: payload as unknown as Record<string, unknown>,
    },
  ];
}

/** Diffs the match's own free-text `status` across polls — a real, verified-meaningful signal ("Innings Break", "X need Y runs", a final result — see fixture.ts's doc comment on why `matchEnded` alone isn't trustworthy). Scoped to the fixture, not one innings — a status change like "Innings Break" isn't about either innings individually. */
export function diffMatchStatus(
  previousStatus: string | undefined,
  match: CricketDataMatchSummary,
  input: { fixtureId: string; sessionId: string; timestamp: string },
): LiveEvent[] {
  if (previousStatus === undefined || previousStatus === match.status) return [];
  const payload: cricket.MatchStatusPayload = { status: match.status };
  return [
    {
      id: `cricket-status-${input.fixtureId}-${deterministicHash(match.status)}`,
      sportId: CRICKET_SPORT_ID,
      sessionId: input.sessionId,
      eventType: "MATCH_STATUS",
      timestamp: input.timestamp,
      source: "cricketdata",
      payload: payload as unknown as Record<string, unknown>,
    },
  ];
}

/**
 * `match_bbb` — best-effort, see types.ts's doc comment: a real, live
 * endpoint, but no real match sampled this checkpoint had `bbbEnabled:
 * true`, so this normalizer is built against an ASSUMED response shape,
 * not a verified one. A `status: "failure"` body (the real, common
 * outcome — confirmed for a `bbbEnabled: false` match) returns `[]`, never
 * throws, exactly like OpenF1Adapter's championship-endpoint handling did
 * for a beta endpoint with no real data (Checkpoint 3).
 */
export function normalizeBalls(
  response: CricketDataBallByBallResponse,
  input: { sessionId: string; timestamp: string },
): LiveEvent[] {
  if (response.status !== "success" || !response.data || !Array.isArray(response.data.bbb)) return [];

  const events: LiveEvent[] = [];
  for (const inningsBlock of response.data.bbb) {
    if (!Array.isArray(inningsBlock.overs)) continue;
    for (const ball of inningsBlock.overs) {
      if (typeof ball.over !== "number" || typeof ball.ball !== "number" || !ball.batsman || !ball.bowler) continue;
      const payload: cricket.BallPayload = {
        over: ball.over,
        ballInOver: ball.ball,
        bowlerId: buildPlayerId(ball.bowler.id),
        batsmanId: buildPlayerId(ball.batsman.id),
        nonStrikerId: null,
        runs: typeof ball.runs === "number" ? ball.runs : 0,
        extras: ball.extra_type ? { type: ball.extra_type, runs: ball.extra_runs ?? 0 } : null,
        wicket: ball.wicket
          ? { type: ball.wicket.type, playerId: buildPlayerId(ball.wicket.player.id), fielderId: ball.wicket.fielder ? buildPlayerId(ball.wicket.fielder.id) : null }
          : null,
      };
      events.push({
        id: `cricket-ball-${input.sessionId}-${ball.over}-${ball.ball}`,
        sportId: CRICKET_SPORT_ID,
        sessionId: input.sessionId,
        eventType: "BALL",
        timestamp: input.timestamp,
        source: "cricketdata",
        payload: payload as unknown as Record<string, unknown>,
      });
    }
  }
  return events;
}
