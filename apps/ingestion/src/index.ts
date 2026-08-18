import { FakeSportsProvider } from "@sports/providers-core";
import { bootstrapFromProvider } from "./bootstrapSynthetic.js";
import { publishLiveEvent } from "./publish.js";
import { config } from "./config";
import { logger } from "./logger";
import { resolveF1Provider, resolveF1StandingsProvider } from "./providers/registry";
import { runF1Job } from "./f1/job";
import { runF1StandingsJob } from "./f1/standingsJob";

/**
 * Two independent jobs run in this one process, selected by configuration
 * (docs/CONTEXT.md §9 "Architecture") — not a single hardcoded provider:
 *
 * 1. The Phase 0 synthetic health-check job — UNCHANGED from Checkpoint 3.
 *    It stays exactly as it was; "the synthetic job stays as a standing
 *    pipeline health check" (this file's original comment) still holds.
 * 2. The F1 job (Checkpoint 4, new) — full-calendar bootstrap, then
 *    active-session polling. See apps/ingestion/src/f1/job.ts.
 * 3. The F1 standings sync (Checkpoint 6, new) — an independent job on its
 *    own interval, using Jolpica-F1 rather than the live-data provider
 *    (OpenF1). See apps/ingestion/src/f1/standingsJob.ts and
 *    docs/CONTEXT.md Checkpoint 6 §4.
 */
async function runSyntheticJob() {
  const provider = new FakeSportsProvider();
  const { session } = await bootstrapFromProvider(provider);
  console.log(`[ingestion] synthetic session ready: ${session.id}`);
  console.log(`[ingestion] emitting one synthetic LiveEvent every ${config.syntheticPollIntervalMs}ms`);

  setInterval(async () => {
    try {
      const events = await provider.pollLiveEvents({ sessionId: session.id });
      for (const event of events) {
        await publishLiveEvent(event);
        console.log(`[ingestion] published ${event.eventType} (${event.id})`);
      }
    } catch (error) {
      console.error("[ingestion] poll tick failed", error);
    }
  }, config.syntheticPollIntervalMs);
}

async function main() {
  await runSyntheticJob();

  const f1Provider = resolveF1Provider();
  if (f1Provider) {
    logger.info({ provider: f1Provider.id }, "starting F1 job");
    // Not awaited: the F1 job's bootstrap + polling loop runs for the life
    // of the process, same as the synthetic job's setInterval above. A
    // rejection inside it is caught internally per-session/per-tick (see
    // job.ts) and must never take down the synthetic job running alongside it.
    runF1Job(f1Provider).catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 job crashed");
    });
  }

  const f1StandingsProvider = resolveF1StandingsProvider();
  if (f1StandingsProvider) {
    logger.info({ provider: f1StandingsProvider.id }, "starting F1 standings sync job");
    // Not awaited, same reasoning as the F1 job above — runs for the life of
    // the process on its own interval; a failed tick is caught internally
    // (standingsJob.ts) and must never take down the other jobs.
    runF1StandingsJob(f1StandingsProvider, config.f1StandingsSeasons).catch((error) => {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 standings job crashed");
    });
  }
}

main().catch((error) => {
  console.error("[ingestion] fatal startup error", error);
  process.exit(1);
});
