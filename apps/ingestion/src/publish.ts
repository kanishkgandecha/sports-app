import { Prisma, prisma } from "@sports/db";
import type { LiveEvent, SequencedLiveEvent } from "@sports/domain";

/**
 * Writes a LiveEvent and notifies the API tier via Postgres NOTIFY, in one
 * place, so every F1 ingestion path publishes the same way — see
 * ARCHITECTURE.md §4.
 *
 * Idempotent by construction (changed at Checkpoint 4 — docs/CONTEXT.md §9
 * "Idempotency"): real providers' adapters build deterministic ids (e.g.
 * OpenF1Adapter's `openf1-lap-{session}-{driver}-{lap}`), so re-processing
 * an overlapping poll window or replaying a cursor after a worker restart
 * produces the exact same id. `create()` is attempted first; a unique-
 * constraint violation (P2002) means this exact event was already recorded
 * — treated as a successful no-op, `created: false`, not an error.
 *
 * Deliberately *not* a plain `upsert`: an upsert can't distinguish "just
 * inserted" from "already existed," and calling `pg_notify` on a duplicate
 * would re-broadcast an already-seen event to every SSE subscriber, which
 * has no dedup logic of its own on the frontend. Only a genuine first
 * insert notifies.
 */
export async function publishLiveEvent(event: LiveEvent): Promise<{ created: boolean; sequence?: string }> {
  const sport = await prisma.sport.findUniqueOrThrow({ where: { slug: event.sportId } });

  try {
    return await prisma.$transaction(async (tx) => {
      const created = await tx.liveEvent.create({
        data: {
          id: event.id,
          sportId: sport.id,
          sessionId: event.sessionId,
          eventType: event.eventType,
          timestamp: new Date(event.timestamp),
          source: event.source,
          payload: event.payload as never,
        },
      });
      const sequencedEvent: SequencedLiveEvent = { ...event, sequence: created.sequence.toString() };
      await tx.$executeRaw`SELECT pg_notify('live_events', ${JSON.stringify(sequencedEvent)})`;
      return { created: true, sequence: sequencedEvent.sequence };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { created: false }; // this exact event was already processed
    }
    throw error;
  }
}
