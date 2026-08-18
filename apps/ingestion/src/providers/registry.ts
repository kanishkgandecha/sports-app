import type { SportsProvider } from "@sports/providers-core";
import { OpenF1Adapter } from "@sports/providers-f1-openf1";
import { JolpicaAdapter } from "@sports/providers-f1-jolpica";
import { CricketDataAdapter } from "@sports/providers-cricket-cricketdata";
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

/**
 * Cricket Checkpoint 1. Defaults to disabled — see config.ts's doc comment
 * on `cricketProvider` for why (a real, confirmed 100 req/day rate limit
 * this checkpoint won't spend without explicit opt-in). Also refuses to
 * start without a real, non-empty `CRICKETDATA_API_KEY` even if
 * `CRICKET_PROVIDER=cricketdata` is set — a missing key would otherwise
 * only surface as every single request failing at runtime.
 */
export function resolveCricketProvider(): SportsProvider | null {
  if (config.cricketProvider === "disabled") {
    logger.info({ cricketProvider: config.cricketProvider }, "Cricket job disabled via configuration");
    return null;
  }
  if (config.cricketProvider === "cricketdata") {
    if (!config.cricketDataApiKey) {
      logger.warn(
        "CRICKET_PROVIDER=cricketdata but CRICKETDATA_API_KEY is not set — Cricket job disabled. See .env.example.",
      );
      return null;
    }
    return new CricketDataAdapter({
      apiKey: config.cricketDataApiKey,
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
    `Unknown CRICKET_PROVIDER "${config.cricketProvider}" — expected "cricketdata" or "disabled"`,
  );
}
