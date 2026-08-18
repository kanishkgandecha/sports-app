// Provider boundary: only the adapter and the HTTP client (for DI in
// tests) are exported. Raw CricketData.org response types (./types.ts)
// and the normalize/* functions never leave this package — same rule as
// every F1 provider package's index.ts.
export { CricketDataAdapter } from "./adapter";
export { CricketDataFetchClient, CricketDataRequestError, type CricketDataHttpClient } from "./client";
