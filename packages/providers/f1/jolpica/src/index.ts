// Provider boundary: only the adapter and the HTTP client (for DI in tests)
// are exported. Raw Jolpica response types (./types.ts) and the normalize/*
// functions never leave this package — same rule as
// packages/providers/f1/openf1/src/index.ts.
export { JolpicaAdapter } from "./adapter";
export { JolpicaFetchClient, JolpicaRequestError, type JolpicaHttpClient } from "./client";
