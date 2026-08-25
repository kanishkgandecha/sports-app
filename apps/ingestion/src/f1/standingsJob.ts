import type { SportsProvider } from "@sports/providers-core";
import { config } from "../config";
import { logger } from "../logger";
import { syncF1Standings } from "./standings";

/**
 * Runs an immediate standings sync, then repeats on its own interval
 * (`F1_STANDINGS_POLL_INTERVAL_MS`, default 30 minutes — championship
 * standings change at most once per race weekend, nowhere near the
 * pace `runF1Job`'s live-session polling needs, so this job's own,
 * much longer, independently configurable interval — docs/CONTEXT.md
 * Checkpoint 6 §4). A failed tick is logged and never stops the interval,
 * same error-isolation posture as `runF1Job`'s poll loop (./job.ts).
 */
export async function runF1StandingsJob(provider: SportsProvider, seasonLabels: string[]): Promise<void> {
  const tick = async () => {
    try {
      await syncF1Standings(provider, { seasonLabels });
    } catch (error) {
      logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 standings sync tick failed");
    }
  };

  await tick();
  setInterval(tick, config.f1StandingsPollIntervalMs);
}
