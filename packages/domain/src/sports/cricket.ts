/**
 * Cricket extension of the core domain model (ARCHITECTURE.md §5), Cricket
 * Checkpoint 1 (docs/CONTEXT.md). A team is a Team, a cricketer is a
 * Player, a tournament/series is a Competition — everything below is what's
 * genuinely cricket-specific, following the approved domain proposal
 * (Checkpoint 7 §8):
 *
 *   Fixture  = the match itself (cricket collapses Fixture/Session the way
 *              football does — no F1-style multi-session weekend)
 *   Session  = one innings (a Test has up to 4, an ODI/T20 has exactly 2 —
 *              chosen because a cricket match's live state genuinely resets
 *              at each innings boundary: different batting/bowling team, a
 *              run rate that starts over, a target that only exists once
 *              the second innings begins chasing)
 *   LiveEvent = ball-by-ball, where the provider actually has it (verified:
 *              CricketData.org's `match_bbb` endpoint exists but returned
 *              `bbbEnabled: false` for every real match sampled this
 *              checkpoint — see the adapter's doc comment) — and a
 *              diffed-score fallback (SCORE_UPDATE/WICKET/MATCH_STATUS)
 *              built from what's reliably available instead, the same
 *              "diff consecutive polls into LiveEvents" technique
 *              OpenF1Adapter already uses for F1's position stream.
 */

export type CricketFormat = "TEST" | "ODI" | "T20";

export type TossDecision = "BAT" | "BOWL";

/**
 * Per-fixture cricket detail — proposed in Checkpoint 7 §8, built here.
 * Deliberately NOT folded into the core `Fixture` table (format/toss are
 * cricket-only facts no other sport's Fixture has a slot for) and
 * deliberately NOT a bigger "match" table — this is the minimum real
 * fields with a confirmed product reason: `format` drives session-count
 * expectations (2 vs up to 4 innings) and UI grouping; `tossWonByTeamId`/
 * `tossDecision` are genuinely fixture-level facts (decided once, before
 * play) distinct from anything session/innings-scoped; `result` is the
 * free-text summary the provider already gives (`status` on a completed
 * match, e.g. "Thailand Women won by 5 wkts") — kept as opaque text
 * because normalizing "who won by how much" into structured fields wasn't
 * asked for and isn't used by anything yet (see docs/CONTEXT.md, Cricket
 * Checkpoint 1 §8 "no speculative fields").
 */
export interface CricketFixtureDetail {
  id: string;
  fixtureId: string;
  /**
   * Nullable, not defaulted — verified real: CricketData.org's own
   * `matchType` field is genuinely absent on some real matches (an ODI
   * with no `matchType` at all). The normalizer falls back to scanning the
   * match `name` text for "test"/"odi"/"t20" (a real, disclosed heuristic
   * over provider text, not a guess) before giving up to `null` — see
   * `normalize/fixture.ts`'s `deriveFormat`.
   */
  format: CricketFormat | null;
  tossWonByTeamId: string | null;
  tossDecision: TossDecision | null;
  result: string | null;
}

/**
 * Current-state snapshot for one innings (`Session`) — the cricket
 * equivalent of F1's `DriverTiming` (Checkpoint 4): one row per innings,
 * upserted in place as new state arrives, never replayed from the
 * `LiveEvent` log to answer "what's the score right now."
 *
 * `target`/`requiredRunRate` are DERIVED, not read from the provider —
 * verified CricketData.org gives neither as a structured field; the only
 * place this information exists in a real response is embedded in free
 * text (`status: "Vida Kovai Kings need 163 runs"`). Computed here instead
 * (`target` = first innings' final total + 1, once the second innings
 * exists; `requiredRunRate` = runs needed ÷ overs remaining) so the Event
 * Center (a future checkpoint) has a real number to render rather than
 * parsing prose — but the computation itself, and the fact that it's a
 * computation and not a passthrough, is disclosed here rather than implied.
 */
export interface CricketInningsState {
  id: string;
  sessionId: string;
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  /** Decimal overs, e.g. 14.3 (14 overs, 3 balls) — matches the provider's own real `o` field format exactly, not reformatted. */
  overs: number;
  strikerId: string | null;
  nonStrikerId: string | null;
  currentBowlerId: string | null;
  /** Only meaningful once a second (or later) innings exists and is chasing — null otherwise, never a fabricated 0. */
  target: number | null;
  requiredRunRate: number | null;
}

export type CricketSessionType = "1ST_INNINGS" | "2ND_INNINGS" | "3RD_INNINGS" | "4TH_INNINGS";

/**
 * A real ball, from `match_bbb` when the provider actually has it for a
 * given match — see this module's doc comment. `wicket`/`extras` null
 * when the ball was neither.
 */
export interface BallPayload {
  over: number;
  ballInOver: number;
  bowlerId: string;
  batsmanId: string;
  nonStrikerId: string | null;
  runs: number;
  extras: { type: string; runs: number } | null;
  wicket: { type: string; playerId: string; fielderId: string | null } | null;
}

/**
 * Derived from diffing two consecutive `score[]` snapshots for the same
 * innings when true ball-by-ball isn't available (the common real case —
 * see this module's doc comment) — the fallback that actually keeps
 * `LiveEvent` populated in practice today.
 */
export interface ScoreUpdatePayload {
  runs: number;
  wickets: number;
  overs: number;
  deltaRuns: number;
  deltaWickets: number;
}

/** A specific, higher-signal case of a score update — wickets increased. `dismissalText` comes from `match_scorecard` when available at the same poll tick, null otherwise (never guessed). */
export interface WicketPayload {
  wickets: number;
  overs: number;
  dismissalText: string | null;
}

/** The provider's own free-text match status changed (e.g. "Innings Break", "need 163 runs", a final result) — surfaced verbatim, never reworded. */
export interface MatchStatusPayload {
  status: string;
}

export const CRICKET_EVENT_TYPES = ["BALL", "SCORE_UPDATE", "WICKET", "MATCH_STATUS"] as const;
export type CricketEventType = (typeof CRICKET_EVENT_TYPES)[number];

/**
 * Cricket Checkpoint 2 — the batting scorecard/bowling figures Checkpoint
 * 2's brief explicitly asks for. Not part of the original Checkpoint 1
 * proposal (which only covered aggregate innings state), but every field
 * below was confirmed real and populated in Checkpoint 1's research
 * (`match_scorecard`'s `batting[]`/`bowling[]` entries — see the adapter
 * package's `types.ts`) — not a speculative addition, the direct,
 * minimum-necessary shape for what this checkpoint was asked to build.
 * Deliberately excludes `extras`/`totals` (verified genuinely empty `{}`
 * on every real scorecard block captured — nothing there to normalize).
 *
 * One row per batsman/bowler per innings — current-state, the same
 * "upserted in place, not append-only" pattern as `CricketInningsState`.
 */
export interface CricketBattingFigure {
  id: string;
  sessionId: string;
  playerId: string;
  /** Batting order within the innings — real data order, used for display, not re-derived. */
  battingOrder: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  /** The real, verbatim `dismissal-text` field — "not out", or a real description like "run out (Neema Pius)". Never re-derived from `dismissal`/`bowler`/`catcher` — the provider's own text is authoritative and already human-readable. */
  dismissalText: string;
}

export interface CricketBowlingFigure {
  id: string;
  sessionId: string;
  playerId: string;
  /** Order bowlers appear in the real scorecard — used for display, not re-derived. */
  bowlingOrder: number;
  overs: number;
  maidens: number;
  runsConceded: number;
  wickets: number;
  economy: number;
}
