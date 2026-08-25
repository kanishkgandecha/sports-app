import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".env");
if (!process.env.DATABASE_URL && existsSync(envFile)) process.loadEnvFile(envFile);

if (!process.env.DATABASE_URL) {
  console.error(
    "Integration tests require DATABASE_URL. Start PostgreSQL, set DATABASE_URL, apply migrations, then run pnpm test:integration.",
  );
  process.exit(1);
}

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  console.error("Integration tests require DATABASE_URL to be a valid PostgreSQL URL.");
  process.exit(1);
}

const reachable = await new Promise((resolveReachability) => {
  const socket = createConnection({
    host: databaseUrl.hostname,
    port: Number(databaseUrl.port || 5432),
  });
  socket.setTimeout(3_000);
  socket.once("connect", () => {
    socket.destroy();
    resolveReachability(true);
  });
  socket.once("timeout", () => {
    socket.destroy();
    resolveReachability(false);
  });
  socket.once("error", () => resolveReachability(false));
});

if (!reachable) {
  console.error(
    `Integration tests cannot reach PostgreSQL at ${databaseUrl.hostname}:${databaseUrl.port || "5432"}. Start the configured database, apply migrations, then retry.`,
  );
  process.exit(1);
}
