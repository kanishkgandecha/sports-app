export * from "./types";
export * from "./baseAdapter";
export * from "./fakeAdapter";
// `sportsProviderContractTests` deliberately does NOT live in this barrel —
// it imports vitest, and this file is what every consumer (including
// production code like apps/ingestion) pulls in via `@sports/providers-core`.
// Import it from the "./testing" subpath instead — see package.json's
// `exports` map and contract.ts.
