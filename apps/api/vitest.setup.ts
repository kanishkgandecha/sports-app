import { fileURLToPath } from "node:url";

// Same as apps/ingestion/vitest.setup.ts — route tests here hit the real
// local Postgres via @sports/db, so DATABASE_URL needs to be loaded the
// same way. fileURLToPath, not `.pathname`, because this repo's path has a
// space ("Sports App") that `.pathname` would leave percent-encoded.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // Already set via the shell, or no .env present.
}
