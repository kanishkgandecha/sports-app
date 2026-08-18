import type { SportsProvider } from "@sports/providers-core";
import { OpenF1Adapter } from "@sports/providers-f1-openf1";
import { config } from "../config";
import { logger } from "../logger";

/**
 * Provider selection lives here, in one place, driven by configuration —
 * not as `if (sport === "f1")` checks scattered through ingestion logic
 * (this checkpoint's explicit requirement, docs/CONTEXT.md §9
 * "Architecture"). The F1 job asks this registry for its provider; it never
 * constructs `OpenF1Adapter` itself.
 */
export function resolveF1Provider(): SportsProvider | null {
  if (config.f1Provider === "disabled") {
    logger.info({ f1Provider: config.f1Provider }, "F1 job disabled via configuration");
    return null;
  }
  if (config.f1Provider === "openf1") {
    return new OpenF1Adapter({
      onRequest: (log) => {
        if (!log.ok) {
          logger.warn({ provider: log.providerId, method: log.method, error: log.error }, "provider request failed");
        } else {
          logger.debug({ provider: log.providerId, method: log.method, durationMs: log.durationMs }, "provider request");
        }
      },
    });
  }
  throw new Error(
    `Unknown F1_PROVIDER "${config.f1Provider}" — expected "openf1" or "disabled"`,
  );
}
