// Provider boundary: only the adapter, the HTTP client (for DI in tests /
// future auth config), and normalized-shape helper types are exported.
// Raw OpenF1 response types (./types.ts) and the normalize/* functions never
// leave this package — see class doc in adapter.ts and docs/CONTEXT.md's
// provider boundary rule.
export { OpenF1Adapter, type OpenF1HistoricalSessionAnalysis, type OpenF1HistoricalSessionDetail } from "./adapter";
export { OpenF1FetchClient, OpenF1RequestError, type OpenF1HttpClient } from "./client";
export type { DriverTimingPatch } from "./normalize/timing";
export type { NormalizedRaceControlMessage } from "./normalize/raceControl";
