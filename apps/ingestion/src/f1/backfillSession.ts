/**
 * Dev utility: backfills one session's real historical OpenF1 data
 * (race control, laps, position, pit, timing patches) into the current-
 * state and LiveEvent tables. Written for Checkpoint 5's local
 * verification (docs/CONTEXT.md §10) — the live poller only ever touches
 * *currently live* sessions (Checkpoint 4's whole point), so a completed
 * session bootstrapped into the calendar has no timing/race-control/pit
 * data in the DB unless something backfills it. OpenF1 keeps historical
 * data available after a session ends (verified at Checkpoint 3), so this
 * is genuinely real F1 data, just fetched retroactively — never fabricated,
 * satisfying this checkpoint's "use real backend data" rule.
 *
 * Usage: pnpm --filter @sports/ingestion exec tsx --env-file=../../.env src/f1/backfillSession.ts <sessionId>
 */
import { OpenF1Adapter } from "@sports/providers-f1-openf1";
import { publishLiveEvent } from "../publish";
import { toPitStopRow, toRaceControlMessageRow, mergeDriverTimingPatches } from "./currentState";
import { upsertDriverTiming, upsertPitStop, upsertRaceControlMessage } from "./persist";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: tsx src/f1/backfillSession.ts <sessionId>");
    process.exit(1);
  }

  const provider = new OpenF1Adapter();

  console.log(`[backfill] fetching all historical events for ${sessionId}...`);
  const events = await provider.pollLiveEvents({ sessionId });
  console.log(`[backfill] ${events.length} events`);

  let published = 0;
  for (const event of events) {
    const { created } = await publishLiveEvent(event);
    if (created) published += 1;
    const rc = toRaceControlMessageRow(event);
    if (rc) await upsertRaceControlMessage(rc);
    const pit = toPitStopRow(event);
    if (pit) await upsertPitStop(pit);
  }
  console.log(`[backfill] published ${published} new LiveEvents (of ${events.length} seen)`);

  console.log(`[backfill] fetching driver timing patches...`);
  const patches = await provider.getDriverTimingPatches(sessionId);
  const merged = mergeDriverTimingPatches(patches);
  for (const patch of merged) {
    await upsertDriverTiming(patch);
  }
  console.log(`[backfill] wrote ${merged.length} DriverTiming rows`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[backfill] failed", error);
    process.exit(1);
  });
