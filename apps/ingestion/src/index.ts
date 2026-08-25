import { prisma } from "@sports/db";
import { runF1Job } from "./f1/job";
import { runF1StandingsJob } from "./f1/standingsJob";
import { logger } from "./logger";
import { resolveF1Provider, resolveF1StandingsProvider } from "./providers/registry";
import type { ScheduledLoop } from "./scheduleLoop";
import { config } from "./config";

/** Runs the two independent Formula 1 ingestion loops: live/session data and championship standings. */
async function main() {
  const activeLoops: ScheduledLoop[] = [];
  const pendingStarts: Promise<unknown>[] = [];
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "ingestion shutdown started");
    await Promise.allSettled(pendingStarts);
    await Promise.allSettled(activeLoops.map((loop) => loop.stop()));
    await prisma.$disconnect();
    logger.info("ingestion shutdown complete");
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));

  const f1Provider = resolveF1Provider();
  if (f1Provider) {
    logger.info({ provider: f1Provider.id }, "starting F1 job");
    pendingStarts.push(
      runF1Job(f1Provider)
        .then((loop) => activeLoops.push(loop))
        .catch((error) => {
          logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 job crashed");
        }),
    );
  }

  const standingsProvider = resolveF1StandingsProvider();
  if (standingsProvider) {
    logger.info({ provider: standingsProvider.id }, "starting F1 standings sync job");
    pendingStarts.push(
      runF1StandingsJob(standingsProvider, config.f1StandingsSeasons)
        .then((loop) => activeLoops.push(loop))
        .catch((error) => {
          logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 standings job crashed");
        }),
    );
  }
}

main().catch((error) => {
  console.error("[ingestion] fatal startup error", error);
  process.exit(1);
});
