/** All Formula 1 ingestion environment variables, read in one place. */
export function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(raw)}`);
  }
  return value;
}

export const config = {
  f1Provider: process.env.F1_PROVIDER ?? "openf1",
  f1PollIntervalMs: readPositiveInteger("F1_POLL_INTERVAL_MS", 15_000),
  f1MaxSessionDurationMs: readPositiveInteger("F1_MAX_SESSION_DURATION_MS", 4 * 60 * 60 * 1000),
  f1BootstrapRequestDelayMs: readPositiveInteger("F1_BOOTSTRAP_REQUEST_DELAY_MS", 400),
  f1CalendarRefreshIntervalMs: readPositiveInteger("F1_CALENDAR_REFRESH_INTERVAL_MS", 6 * 60 * 60 * 1000),
  f1BootstrapSeasons: (process.env.F1_BOOTSTRAP_SEASONS ?? String(new Date().getFullYear()))
    .split(",")
    .map((season) => season.trim())
    .filter(Boolean),
  f1StandingsProvider: process.env.F1_STANDINGS_PROVIDER ?? "jolpica",
  f1StandingsPollIntervalMs: readPositiveInteger("F1_STANDINGS_POLL_INTERVAL_MS", 30 * 60 * 1000),
  f1StandingsSeasons: (
    process.env.F1_STANDINGS_SEASONS ??
    process.env.F1_BOOTSTRAP_SEASONS ??
    String(new Date().getFullYear())
  )
    .split(",")
    .map((season) => season.trim())
    .filter(Boolean),
};
