import { buildApp } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
const databaseUrl = process.env.DATABASE_URL;

async function main() {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required — copy .env.example to .env at the repo root");
  }

  const app = await buildApp(databaseUrl);

  try {
    await app.listen({ port, host: "0.0.0.0" });
    app.log.info(`API listening on :${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
