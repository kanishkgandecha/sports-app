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
};
