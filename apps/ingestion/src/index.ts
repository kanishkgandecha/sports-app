import { FakeSportsProvider } from "@sports/providers-core";
import { bootstrapFromProvider } from "./bootstrapSynthetic.js";
import { publishLiveEvent } from "./publish.js";
import { config } from "./config";
import { logger } from "./logger";
import { resolveF1Provider } from "./providers/registry";
import { runF1Job } from "./f1/job";

/**
 * Two independent jobs run in this one process, selected by configuration
 * (docs/CONTEXT.md §9 "Architecture") — not a single hardcoded provider:
 *
 * 1. The Phase 0 synthetic health-check job — UNCHANGED from Checkpoint 3.
 *    It stays exactly as it was; "the synthetic job stays as a standing
 *    pipeline health check" (this file's original comment) still holds.
 * 2. The F1 job (Checkpoint 4, new) — full-calendar bootstrap, then
 *    active-session polling. See apps/ingestion/src/f1/job.ts.
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
}

main().catch((error) => {
  console.error("[ingestion] fatal startup error", error);
  process.exit(1);
});
