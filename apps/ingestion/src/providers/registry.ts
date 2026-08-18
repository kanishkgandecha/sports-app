import type { SportsProvider } from "@sports/providers-core";
import { OpenF1Adapter } from "@sports/providers-f1-openf1";
import { JolpicaAdapter } from "@sports/providers-f1-jolpica";
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

/**
 * Standings are resolved independently of `resolveF1Provider` above —
 * Jolpica-F1 is specifically the standings/reference-data provider (added
 * Checkpoint 6, docs/CONTEXT.md Checkpoint 6 §4), never a replacement for
 * OpenF1 as the live-data provider. A deployment can run the live F1 job
 * with `F1_PROVIDER=openf1` and the standings sync with
 * `F1_STANDINGS_PROVIDER=jolpica` at the same time — this is the default —
 * or disable either independently.
 */
export function resolveF1StandingsProvider(): SportsProvider | null {
  if (config.f1StandingsProvider === "disabled") {
    logger.info({ f1StandingsProvider: config.f1StandingsProvider }, "F1 standings sync disabled via configuration");
    return null;
  }
  if (config.f1StandingsProvider === "jolpica") {
    return new JolpicaAdapter({
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
    `Unknown F1_STANDINGS_PROVIDER "${config.f1StandingsProvider}" — expected "jolpica" or "disabled"`,
  );
}
