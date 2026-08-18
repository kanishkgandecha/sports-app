import { prisma } from "@sports/db";
import type { LiveEvent } from "@sports/domain";

/**
 * Writes a LiveEvent and notifies the API tier via Postgres NOTIFY, in one
 * place, so every ingestion job (synthetic today, F1/cricket/football/
 * esports later) publishes the same way — see ARCHITECTURE.md §4.
 */
export async function publishLiveEvent(event: LiveEvent) {
  await prisma.liveEvent.create({
    data: {
      id: event.id,
      sportId: (await prisma.sport.findUniqueOrThrow({ where: { slug: event.sportId } })).id,
      sessionId: event.sessionId,
      eventType: event.eventType,
      timestamp: new Date(event.timestamp),
      source: event.source,
      payload: event.payload as never,
    },
  });

  await prisma.$executeRaw`SELECT pg_notify('live_events', ${JSON.stringify(event)})`;
}
