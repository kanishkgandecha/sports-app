/**
 * All ingestion-related environment variables, read in one place — see
 * docs/CONTEXT.md §9 "Configuration". Nothing here claims a specific
 * data-freshness guarantee; OpenF1's real-time (paid/authenticated) access
 * characteristics haven't been verified (Checkpoint 3 §8 "Unresolved
 * questions"), so cadence is described as "how often we poll," not "how
 * fresh the data is."
 */
export const config = {
  /** Phase 0 synthetic health-check job — unchanged from Checkpoint 3. */
  syntheticPollIntervalMs: Number(process.env.INGESTION_SYNTHETIC_INTERVAL_MS ?? 2000),

  /**
   * "openf1" (default) runs the real F1 job; "disabled" turns it off
   * entirely without a code change — e.g. for an environment that only
   * wants the synthetic health-check job running.
   */
  f1Provider: process.env.F1_PROVIDER ?? "openf1",

  /**
   * How often the F1 job polls each currently-active session. 15s by
   * default: OpenF1's free tier allows 3 req/s — one poll tick makes up to
   * 8 requests across pollLiveEvents (4) + getDriverTimingPatches (4,
   * including the documented duplicate position fetch — see
   * docs/CONTEXT.md §9), so 15s keeps sustained load well under the limit
   * even during a live session. Configuration-driven so production can be
   * tuned without a code change, per this checkpoint's explicit requirement.
   */
  f1PollIntervalMs: Number(process.env.F1_POLL_INTERVAL_MS ?? 15_000),

  /**
   * Safety cap for a session with no known end time, or a corrupt/far-future
   * one — never treat a session as "live" more than this long after it
   * started. 4 hours comfortably covers even a long red-flag-delayed race.
   */
  f1MaxSessionDurationMs: Number(process.env.F1_MAX_SESSION_DURATION_MS ?? 4 * 60 * 60 * 1000),

  /**
   * Minimum delay between successive `/sessions` requests while
   * bootstrapping a season's fixtures — see concurrency.ts's doc comment
   * for why this is paced dispatch, not just a concurrency cap. 400ms
   * caps this phase at 2.5 req/s, safely under OpenF1's documented 3 req/s
   * free-tier limit even accounting for request latency.
   */
  f1BootstrapRequestDelayMs: Number(process.env.F1_BOOTSTRAP_REQUEST_DELAY_MS ?? 400),

  /**
   * Which season(s) the calendar bootstrap covers — "the relevant season/
   * calendar" per this checkpoint's brief, not every season OpenF1 has ever
   * had data for (2023-present). Comma-separated years; defaults to the
   * current year only. Set explicitly (e.g. "2023,2024,2025,2026") to
   * backfill more history.
   */
  f1BootstrapSeasons: (process.env.F1_BOOTSTRAP_SEASONS ?? String(new Date().getFullYear()))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Checkpoint 6 — standings are a separate concern from the live-data
   * provider (`f1Provider`/`F1_PROVIDER`, OpenF1): "jolpica" (default) runs
   * the real Jolpica-F1 standings sync; "disabled" turns it off without a
   * code change. See docs/CONTEXT.md Checkpoint 6 §4 "Provider decision".
   */
  f1StandingsProvider: process.env.F1_STANDINGS_PROVIDER ?? "jolpica",

  /**
   * How often the standings sync job re-fetches. Championship standings
   * change at most once per race weekend — nowhere near the cadence
   * `f1PollIntervalMs` needs for live sessions — so this defaults to 30
   * minutes, independently configurable.
   */
  f1StandingsPollIntervalMs: Number(process.env.F1_STANDINGS_POLL_INTERVAL_MS ?? 30 * 60 * 1000),

  /**
   * Which season(s) the standings sync covers. Reuses `F1_BOOTSTRAP_SEASONS`
   * by default (the same seasons the calendar bootstrap covers, since a
   * Standing row's season/competition FK targets have to already exist —
   * see standings.ts) rather than introducing a second season list to keep
   * in sync by hand; overridable independently via `F1_STANDINGS_SEASONS`.
   */
  f1StandingsSeasons: (
    process.env.F1_STANDINGS_SEASONS ??
    process.env.F1_BOOTSTRAP_SEASONS ??
    String(new Date().getFullYear())
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  /**
   * Cricket Checkpoint 1. Deliberately defaults to **"disabled"**, unlike
   * every F1 provider default — CricketData.org's real, confirmed rate
   * limit is 100 requests/**day** (verified via the API's own real
   * response metadata, not just docs — see `packages/providers/cricket/
   * cricketdata/src/client.ts`'s doc comment), a scarce resource this
   * checkpoint won't spend by default just because ingestion started.
   * Requires explicit opt-in: `CRICKET_PROVIDER=cricketdata` AND a real
   * `CRICKETDATA_API_KEY`.
   */
  cricketProvider: process.env.CRICKET_PROVIDER ?? "disabled",
  cricketDataApiKey: process.env.CRICKETDATA_API_KEY ?? "",

  /**
   * How often the Cricket job polls active sessions (and, since discovery
   * is now free in steady state — see `cricketMetadataRefreshIntervalMs`
   * below — re-runs current-match discovery). **Real, corrected math**
   * against the confirmed 100/day cap, after Cricket Checkpoint 4's
   * request-budget remediation (docs/CONTEXT.md has the full audit this
   * replaces a previously-wrong estimate with):
   *
   * Per active (live) session, per tick: `pollLiveEvents` makes exactly 2
   * real requests (`match_info` + `match_bbb` — both were already being
   * made; neither was ever "free", unlike what an earlier version of this
   * comment implied). 30 minutes (this default) → 48 ticks/day → 96
   * requests/day for ONE continuously-live session, from base polling
   * alone — already most of the 100/day budget. `cricketMaxActiveSessions`
   * (below) bounds how many sessions can be live at once; running this
   * interval any faster, or running more than 1 truly concurrent live
   * session for a full day, will not fit in the confirmed daily cap on
   * this dev-tier key — that is a real, honest constraint of the free
   * provider tier, not something a smarter cache can fix (see
   * `getRequestBudgetStatus`/`cricketDailyRequestBudget` below for how
   * this is actually enforced rather than just hoped for).
   */
  cricketPollIntervalMs: Number(process.env.CRICKET_POLL_INTERVAL_MS ?? 30 * 60 * 1000),

  /**
   * How often `getInningsState`/`getScorecard`/`getRosterForFixture`/
   * `getFixtureDetail` refresh together (one `Promise.all`, now sharing
   * exactly one real `match_info` call and one real `match_scorecard`
   * call thanks to the adapter's request-cache — see
   * `CricketDataAdapter`'s doc comment; this was the checkpoint's other
   * real bug — that block used to cost 4 `match_info` calls, not 1).
   * 2 real requests per refresh, ~24 refreshes/day at this default (60
   * min — 2x `cricketPollIntervalMs`) → ~48 requests/day per live
   * fixture, on top of base polling's ~96/day. Slower than the base poll
   * interval on purpose — this is enrichment (striker/bowler/scorecard),
   * not the core score/wicket signal, which `pollLiveEvents` already
   * keeps fresh every base tick from `match_info` alone.
   */
  cricketInningsStateIntervalMs: Number(process.env.CRICKET_INNINGS_STATE_INTERVAL_MS ?? 60 * 60 * 1000),

  /**
   * Safety cap for a cricket session (one innings) with no known end
   * time. Much larger than F1's 4 hours — a real Test innings can run
   * most of a full day's play. 12 hours comfortably covers even a long
   * rain-delayed innings without ever treating a genuinely-finished one
   * as still live indefinitely.
   */
  cricketMaxSessionDurationMs: Number(process.env.CRICKET_MAX_SESSION_DURATION_MS ?? 12 * 60 * 60 * 1000),

  /**
   * Cricket Checkpoint 4 — how often `getCompetitions`/`getSeasons` (the
   * real `series_info`-consuming, slow-changing metadata) re-run.
   * Competitions/seasons genuinely change on the order of days, not every
   * poll tick — the original code re-ran both on *every* 30-minute tick
   * unconditionally, which alone produced roughly 500+ real requests/day
   * with zero live matches (the single largest, and entirely avoidable,
   * source of real request volume this pipeline had — see
   * docs/CONTEXT.md). 6 hours (4x/day) keeps a genuinely new competition/
   * series discoverable within a bounded, honest window without spending
   * a meaningful fraction of the daily budget on unchanged reference
   * data. Current-match *discovery* (fixtures/sessions — free in steady
   * state) still runs every `cricketPollIntervalMs` tick regardless, so
   * status changes on already-known fixtures are still picked up
   * promptly; only *new competitions/series* wait for this longer cycle.
   */
  cricketMetadataRefreshIntervalMs: Number(process.env.CRICKET_METADATA_REFRESH_INTERVAL_MS ?? 6 * 60 * 60 * 1000),

  /**
   * Cricket Checkpoint 4 — the real, confirmed CricketData.org free-tier
   * daily cap (`info.hitsLimit` on every real response — see client.ts's
   * doc comment), and how much headroom to keep before it. The job checks
   * `getRequestBudgetStatus()` (the provider's own live-reported
   * `hitsToday`) against `cricketDailyRequestBudget -
   * cricketRequestSafetyMarginRequests` before spending any further real
   * requests in a tick, and skips them (logging why) once within the
   * margin — a *reactive* guard based on what THIS process has actually
   * observed, not a perfect preventive cap shared across processes/keys
   * (see `CricketDataAdapter.getRequestBudgetStatus`'s doc comment for
   * that honestly-disclosed limitation). The margin defaults to 10 — not
   * 0 — so normal development/testing activity sharing the same key
   * doesn't tip the real usage over 100 the moment this process's own
   * guard would otherwise still say "go ahead."
   */
  cricketDailyRequestBudget: Number(process.env.CRICKETDATA_DAILY_REQUEST_BUDGET ?? 100),
  cricketRequestSafetyMarginRequests: Number(process.env.CRICKETDATA_REQUEST_SAFETY_MARGIN ?? 10),

  /**
   * Cricket Checkpoint 4 — a hard cap on how many Cricket sessions this
   * process will poll concurrently, however many the database currently
   * classifies "live". Without this, request volume scales linearly and
   * unbounded with concurrent live matches (a real, confirmed risk — a
   * single real `currentMatches` snapshot this project captured had 18
   * matches in flight at once). 3 by default: per `cricketPollIntervalMs`'s
   * own math, even 1 fully-live session for a full day is already close
   * to the daily budget, so 3 is a deliberately conservative dev-tier
   * ceiling, not a claim that 3 concurrent live matches comfortably fit
   * the budget — `getActiveCricketSessions` (activeSessions.ts) applies
   * this deterministically (earliest-started sessions first) and logs
   * when it skips lower-priority ones.
   */
  cricketMaxActiveSessions: Number(process.env.CRICKET_MAX_ACTIVE_SESSIONS ?? 3),
};
