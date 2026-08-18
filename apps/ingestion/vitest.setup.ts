import { fileURLToPath } from "node:url";

// Integration tests here (bootstrapCalendar, persist) hit the real local
// Postgres via @sports/db — the same one `docker compose up` starts for
// `pnpm dev` (see README.md). `tsx --env-file` covers dev/start; `vitest
// run` needs its own env loading, done here with Node's native API so no
// extra dependency (e.g. dotenv) is needed.
//
// Uses fileURLToPath rather than the URL's own `.pathname` — this repo's
// path contains a space ("Sports App"), and `.pathname` returns it percent-
// encoded ("Sports%20App"), which fs/process.loadEnvFile then fail to find.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // Already set via the shell, or no .env present — either is fine; the
  // tests below fail with a clear Prisma connection error if DATABASE_URL
  // truly isn't set, which is a better signal than silently swallowing this.
}
