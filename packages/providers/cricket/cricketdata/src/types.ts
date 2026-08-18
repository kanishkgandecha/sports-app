/**
 * Raw CricketData.org (api.cricapi.com/v1) response shapes. Verified
 * against real, live authenticated calls this checkpoint (Cricket
 * Checkpoint 1 — docs/CONTEXT.md §1 "Research") — NOT copied from the
 * vendor's own docs, which are thin and largely gated behind a signup this
 * environment couldn't complete interactively; a real (user-supplied) API
 * key was used to call the live API directly, the same standard every F1
 * provider checkpoint held itself to.
 *
 * These types exist ONLY inside this package — nothing outside
 * `packages/providers/cricket/cricketdata` may import from this file (the
 * same provider-boundary rule as every F1 adapter).
 *
 * Every field below is marked either VERIFIED (present in a real captured
 * response this checkpoint) or ASSUMED (not independently confirmed — see
 * the note on each). Where verified, optionality reflects what was
 * actually observed absent on at least one real match, not a guess.
 */

/** VERIFIED — every match summary object. `matchType` and `tossWinner`/`tossChoice` confirmed genuinely absent on some real matches (the latter only ever appear on `match_info` detail, never on a list summary). */
export interface CricketDataTeamInfo {
  name: string;
  /** VERIFIED absent on at least one real team (a team CricketData.org has no short code for yet — "Barbados Tridents" had none). */
  shortname?: string;
  img: string;
}

/** VERIFIED — one innings' running total, exactly as returned in `score[]`. */
export interface CricketDataScoreEntry {
  r: number;
  w: number;
  /** Decimal overs, e.g. 16.4 (16 overs, 4 balls) — VERIFIED real format. */
  o: number;
  inning: string;
}

/** VERIFIED — the shape shared by `currentMatches`/`matches` list items AND `match_info`'s single-match detail (detail adds `tossWinner`/`tossChoice`, confirmed absent from list items). */
export interface CricketDataMatchSummary {
  id: string;
  name: string;
  /** VERIFIED absent on at least one real match (an ODI with no `matchType` field at all — not even `null`). */
  matchType?: "test" | "odi" | "t20" | string;
  /** Free text — VERIFIED this is the ONLY place a target/required-run-rate-style fact appears ("Vida Kovai Kings need 163 runs"); there is no structured field for it. */
  status: string;
  venue: string;
  /** Real format observed: "2026-08-18" (date-only). */
  date: string;
  /** Real format observed: "2026-08-18T14:00:00" (no timezone suffix — VERIFIED, treated as UTC; not independently confirmed against a known-timezone match). */
  dateTimeGMT: string;
  teams: string[];
  teamInfo: CricketDataTeamInfo[];
  score?: CricketDataScoreEntry[];
  /** Only present on `match_info` detail — VERIFIED absent from list summaries. Free text, e.g. "tanzania women" (lowercase observed — not normalized by the provider). */
  tossWinner?: string;
  /** VERIFIED real values: "bat" | "bowl" (lowercase). */
  tossChoice?: "bat" | "bowl" | string;
  series_id: string;
  fantasyEnabled: boolean;
  /** Whether `match_bbb` (ball-by-ball) has real data for this match — VERIFIED `false` on every one of 18 real current/recent matches sampled across international, domestic T20, and women's cricket this checkpoint. Never observed `true` — see adapter.ts's doc comment. */
  bbbEnabled: boolean;
  hasSquad: boolean;
  matchStarted: boolean;
  /**
   * VERIFIED unreliable alone: a real match with `matchStarted: true,
   * matchEnded: false` had `status: "... awarded the match (opposition
   * refused to play)"` — genuinely over, but `matchEnded` never flipped.
   * `status` text must be interpreted too; `matchEnded` is a hint, not a
   * ground truth.
   */
  matchEnded: boolean;
}

export interface CricketDataMatchListResponse {
  apikey: string;
  data: CricketDataMatchSummary[];
  status: "success" | "failure";
  info: CricketDataResponseInfo;
}

export interface CricketDataMatchInfoResponse {
  apikey: string;
  data: CricketDataMatchSummary;
  status: "success" | "failure";
  info: CricketDataResponseInfo;
}

/** VERIFIED real fields — `offsetRows`/`totalRows` only observed on list endpoints (`currentMatches`), not on single-match detail. */
export interface CricketDataResponseInfo {
  hitsToday: number;
  hitsUsed: number;
  hitsLimit: number;
  credits: number;
  server: number;
  offsetRows?: number;
  totalRows?: number;
  queryTime: number;
  s: number;
  cache: number;
}

/** VERIFIED — `match_scorecard`'s `batsman`/`bowler`/`catcher` player references share this exact shape everywhere they appear. */
export interface CricketDataPlayerRef {
  id: string;
  name: string;
  cricbuzz_id?: string;
}

/** VERIFIED real fields. `dismissal`/`bowler`/`catcher` absent for a not-out batsman (confirmed: the one not-out entry in a real scorecard had none of these three, only `dismissal-text: "not out"`). */
export interface CricketDataBattingEntry {
  batsman: CricketDataPlayerRef;
  /** e.g. "runout", "caught", "bowled" — VERIFIED absent when not out. */
  dismissal?: string;
  bowler?: CricketDataPlayerRef;
  catcher?: CricketDataPlayerRef;
  "dismissal-text": string;
  r: number;
  b: number;
  "4s": number;
  "6s": number;
  sr: number;
}

/** VERIFIED real fields. */
export interface CricketDataBowlingEntry {
  bowler: CricketDataPlayerRef;
  o: number;
  m: number;
  r: number;
  w: number;
  nb: number;
  wd: number;
  eco: number;
}

/** VERIFIED real fields — present in every scorecard block sampled, though every value was 0 in the one real block this checkpoint captured with fielding entries. */
export interface CricketDataCatchingEntry {
  catcher: CricketDataPlayerRef;
  stumped: number;
  runout: number;
  catch: number;
  cb: number;
  lbw: number;
  bowled: number;
}

/**
 * VERIFIED real shape — one block per innings. `extras`/`totals` VERIFIED
 * to be genuinely empty objects (`{}`) on at least one real, live match's
 * scorecard, not a placeholder for something normalization should expect —
 * treated as ASSUMED-shaped-when-present (no real populated example was
 * captured this checkpoint) but confirmed-absent-is-real (never assume
 * they're populated).
 */
export interface CricketDataScorecardBlock {
  batting: CricketDataBattingEntry[];
  bowling: CricketDataBowlingEntry[];
  catching: CricketDataCatchingEntry[];
  /** ASSUMED shape when populated — never observed non-empty this checkpoint. */
  extras: Record<string, unknown>;
  /** ASSUMED shape when populated — never observed non-empty this checkpoint. */
  totals: Record<string, unknown>;
  inning: string;
}

export interface CricketDataScorecardResponse {
  apikey: string;
  data?: CricketDataMatchSummary & { scorecard: CricketDataScorecardBlock[] };
  status: "success" | "failure";
  /**
   * VERIFIED real failure mode: `match_scorecard` returned
   * `{"status":"failure","reason":"ERR: Scorecard {id} not found"}` for
   * TWO real matches this checkpoint — one live (`matchEnded: false`) and
   * one fully completed (`matchEnded: true`, a real result in `status`).
   * Scorecard availability is NOT guaranteed by match state; treat as
   * optional/best-effort everywhere, never assume presence.
   */
  reason?: string;
  info?: CricketDataResponseInfo;
}

/**
 * ASSUMED shape — `match_bbb` is a real, live endpoint (confirmed by a
 * real call returning a real, match-specific failure reason rather than a
 * generic 404/auth error), but no real match sampled this checkpoint had
 * `bbbEnabled: true`, so no real success payload was ever captured. Shape
 * below is inferred from this vendor's own consistent conventions
 * elsewhere (the `{id,name,cricbuzz_id}` player-ref shape used identically
 * throughout `match_scorecard`) plus standard ball-by-ball fields any
 * cricket provider would need — NOT independently verified. The adapter
 * treats a `match_bbb` failure (the real, common case) as "no ball data,"
 * never an error — see adapter.ts.
 */
export interface CricketDataBallEntry {
  over: number;
  ball: number;
  batsman: CricketDataPlayerRef;
  bowler: CricketDataPlayerRef;
  runs: number;
  /** ASSUMED — ball-tracking extras convention, not confirmed. */
  extra_type?: string;
  extra_runs?: number;
  /** ASSUMED — wicket-on-this-ball convention, not confirmed. */
  wicket?: {
    type: string;
    player: CricketDataPlayerRef;
    fielder?: CricketDataPlayerRef;
  };
}

export interface CricketDataBallByBallResponse {
  apikey: string;
  data?: {
    id: string;
    bbb: Array<{ inning: string; overs: CricketDataBallEntry[] }>;
  };
  status: "success" | "failure";
  reason?: string;
}

/** VERIFIED real shape (`series_info`). */
export interface CricketDataSeriesInfo {
  id: string;
  name: string;
  /** VERIFIED genuinely undefined on at least one real series (this checkpoint's own live smoke test hit it) — never assume present. */
  startdate?: string;
  /** VERIFIED real value observed as `"Aug 28"` — NOT always a full ISO date the way `startdate` is when present. Never parse with `new Date()` and assume success. */
  enddate?: string;
  odi: number;
  t20: number;
  test: number;
  squads: number;
  matches: number;
}

export interface CricketDataSeriesInfoResponse {
  apikey: string;
  data?: {
    info: CricketDataSeriesInfo;
    matchList: CricketDataMatchSummary[];
  };
  status: "success" | "failure";
  reason?: string;
  info?: CricketDataResponseInfo;
}

/** VERIFIED real failure envelope — every non-success response this checkpoint observed used exactly this shape. */
export interface CricketDataErrorBody {
  apikey?: string;
  status: "failure";
  reason: string;
}
