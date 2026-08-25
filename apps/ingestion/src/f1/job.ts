import { prisma } from "@sports/db";
import type { SportsProvider } from "@sports/providers-core";
import type { DriverTimingPatch } from "@sports/providers-f1-openf1";
import type { LiveEvent } from "@sports/domain";
import { config } from "../config";
import { logger } from "../logger";
import { publishLiveEvent } from "../publish";
import { bootstrapF1Calendar } from "./bootstrapCalendar";
import { getActiveF1Sessions } from "./activeSessions";
import { mergeDriverTimingPatches, toPitStopRow, toRaceControlMessageRow } from "./currentState";
import { upsertDriverTiming, upsertPitStop, upsertRaceControlMessage } from "./persist";
import { scheduleLoop, type ScheduledLoop } from "../scheduleLoop";
import { loadProviderCursors, saveProviderCursor } from "../providerCursor";

/**
 * `getDriverTimingPatches` is a bonus method on `OpenF1Adapter`, deliberately
 * not on the shared `SportsProvider` interface (docs/CONTEXT.md §8/§9) —
 * current-state timing shapes are genuinely provider/sport-specific in a way
 * `getVenues` wasn't. This narrow, documented extension type lets the job
 * use it when the resolved provider has it, without widening the shared
 * interface for a capability other sports likely won't share the same shape
 * of.
 */
interface CurrentStateCapableProvider extends SportsProvider {
  getDriverTimingPatches(sessionId: string, since?: string): Promise<DriverTimingPatch[]>;
}

function hasCurrentStatePatches(provider: SportsProvider): provider is CurrentStateCapableProvider {
  return typeof (provider as Partial<CurrentStateCapableProvider>).getDriverTimingPatches === "function";
}

/**
 * Orchestrates the F1 job end to end: bootstrap once at startup (§ Historical
 * vs Live), then repeatedly select active sessions and poll only those
 * (§ Active polling), publishing LiveEvents and current-state rows from the
 * same normalized data (§ Live current state). See docs/CONTEXT.md §9
 * "Architecture" for the full data flow diagram.
 *
 * A per-session try/catch means one failing session (provider timeout,
 * malformed response, rate limit) never stops the others from being polled
 * in the same tick or any future tick — see docs/CONTEXT.md §9
 * "Error handling".
 */
export async function runF1Job(provider: SportsProvider): Promise<ScheduledLoop> {
  logger.info({ seasons: config.f1BootstrapSeasons }, "F1 job starting — bootstrapping calendar");
  try {
    await bootstrapF1Calendar(provider, { seasonLabels: config.f1BootstrapSeasons });
  } catch (error) {
    // A failed bootstrap means there's nothing to poll yet — log loudly and
    // let the next tick's poll loop find zero active sessions rather than
    // crashing the whole ingestion worker (the synthetic job must keep
    // running regardless — see docs/CONTEXT.md §9 "Error handling").
    logger.error({ error: error instanceof Error ? error.message : String(error) }, "F1 calendar bootstrap failed");
  }

  // sessionId -> ISO timestamp of the latest event this job has published
  // for it, used as pollLiveEvents' `since` cursor so each tick only
  // requests what's new (verified working against the real API at
  // Checkpoint 3 — the "date>" query convention).
  const cursors = await loadProviderCursors(provider.id);

  return scheduleLoop(async () => {
    try {
      const sessions = await prisma.session.findMany({
        where: { fixture: { sport: { slug: provider.sportId } } },
        select: { id: true, startTime: true, endTime: true },
      });
      await pollActiveSessions(provider, getActiveF1Sessions(sessions), cursors);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "failed to load sessions for active-session selection",
      );
    }
  }, config.f1PollIntervalMs);
}

/**
 * Extracted from the `setInterval` wrapper above so the per-session error
 * isolation (the core requirement this checkpoint tests for — see
 * job.test.ts) is directly testable without faking timers.
 */
export async function pollActiveSessions(
  provider: SportsProvider,
  activeTargets: { sessionId: string; reason: string }[],
  cursors: Map<string, string>,
): Promise<void> {
  if (activeTargets.length === 0) {
    logger.debug("no active F1 sessions this tick");
    return;
  }

  for (const target of activeTargets) {
    try {
      await pollOneSession(provider, target.sessionId, cursors);
    } catch (error) {
      // One session's failure must not stop the others in this same tick.
      logger.error(
        {
          sessionId: target.sessionId,
          reason: target.reason,
          error: error instanceof Error ? error.message : String(error),
        },
        "F1 session poll failed",
      );
    }
  }
}

async function pollOneSession(
  provider: SportsProvider,
  sessionId: string,
  cursors: Map<string, string>,
): Promise<void> {
  const since = cursors.get(sessionId);
  const events = await provider.pollLiveEvents({ sessionId, since });

  let createdCount = 0;
  let latestTimestamp = since;
  for (const event of events) {
    const { created } = await publishLiveEvent(event);
    if (created) createdCount += 1;
    await writeCurrentState(event);
    if (!latestTimestamp || event.timestamp > latestTimestamp) {
      latestTimestamp = event.timestamp;
    }
  }
  // getDriverTimingPatches has no dedicated LiveEvent type to key off (see
  // docs/CONTEXT.md §7.3/§9) — pulled and merged separately, same `since`.
  const patches = hasCurrentStatePatches(provider) ? await provider.getDriverTimingPatches(sessionId, since) : [];
  for (const patch of mergeDriverTimingPatches(patches)) {
    await upsertDriverTiming(patch);
  }

  if (latestTimestamp) {
    await saveProviderCursor(provider.id, sessionId, latestTimestamp);
    cursors.set(sessionId, latestTimestamp);
  }

  logger.info(
    { sessionId, eventsPublished: createdCount, eventsSeen: events.length, timingPatches: patches.length },
    "F1 session polled",
  );
}

async function writeCurrentState(event: LiveEvent): Promise<void> {
  const raceControlRow = toRaceControlMessageRow(event);
  if (raceControlRow) await upsertRaceControlMessage(raceControlRow);

  const pitStopRow = toPitStopRow(event);
  if (pitStopRow) await upsertPitStop(pitStopRow);
}
