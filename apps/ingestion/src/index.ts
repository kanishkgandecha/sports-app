import { FakeSportsProvider } from "@sports/providers-core";
import { bootstrapFromProvider } from "./bootstrapSynthetic.js";
import { publishLiveEvent } from "./publish.js";

/**
 * Phase 0 exit criterion (ARCHITECTURE.md §7, step 6/9): this worker proves
 * ingestion -> Postgres -> LISTEN/NOTIFY -> SSE end to end using
 * FakeSportsProvider, before any real sport-specific job exists. Phase 1
 * adds `jobs/f1/` alongside this file — it does not replace it; the
 * synthetic job stays as a standing pipeline health check.
 */
const intervalMs = Number(process.env.INGESTION_SYNTHETIC_INTERVAL_MS ?? 2000);
const provider = new FakeSportsProvider();

async function main() {
  const { session } = await bootstrapFromProvider(provider);
  console.log(`[ingestion] synthetic session ready: ${session.id}`);
  console.log(`[ingestion] emitting one synthetic LiveEvent every ${intervalMs}ms`);

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
  }, intervalMs);
}

main().catch((error) => {
  console.error("[ingestion] fatal startup error", error);
  process.exit(1);
});
