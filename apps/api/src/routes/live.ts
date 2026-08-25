import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import type { SequencedLiveEvent } from "@sports/domain";
import type { LiveEventBus } from "../liveEventBus.js";

const REPLAY_BATCH_SIZE = 500;

export function parseCursor(value: string | string[] | undefined): bigint | null | "invalid" {
  if (Array.isArray(value)) return "invalid";
  if (value === undefined || value === "") return null;
  if (!/^(0|[1-9]\d*)$/.test(value)) return "invalid";
  return BigInt(value);
}

function toTransportEvent(row: {
  id: string;
  sequence: bigint;
  sessionId: string;
  eventType: string;
  timestamp: Date;
  source: string;
  payload: unknown;
  sport: { slug: string };
}): SequencedLiveEvent {
  return {
    id: row.id,
    sequence: row.sequence.toString(),
    sportId: row.sport.slug,
    sessionId: row.sessionId,
    eventType: row.eventType,
    timestamp: row.timestamp.toISOString(),
    source: row.source,
    payload: row.payload as Record<string, unknown>,
  };
}

function writeEvent(reply: { raw: NodeJS.WritableStream }, event: SequencedLiveEvent) {
  reply.raw.write(`id: ${event.sequence}\nevent: live-event\ndata: ${JSON.stringify(event)}\n\n`);
}

/**
 * SSE delivery per ARCHITECTURE.md §4: one stream per session, fed by
 * LiveEventBus (which itself is fed by Postgres LISTEN/NOTIFY).
 */
export async function liveRoutes(app: FastifyInstance, bus: LiveEventBus) {
  app.get<{ Params: { sessionId: string }; Querystring: { after?: string } }>(
    "/api/sessions/:sessionId/stream",
    async (req, reply) => {
      const { sessionId } = req.params;
      const cursor = parseCursor(req.query.after ?? req.headers["last-event-id"]);
      if (cursor === "invalid") {
        return reply.code(400).send({ error: "after/Last-Event-ID must be a non-negative integer" });
      }

      // Writing straight to the raw Node response (below) bypasses
      // Fastify's normal reply lifecycle, which is where `@fastify/cors`
      // (registered globally in app.ts) injects Access-Control-Allow-*
      // headers on every other route. Found via Checkpoint 5's real-
      // browser verification, not curl — curl doesn't enforce CORS, so
      // this had been silently broken for every browser client since
      // Phase 0's LiveTicker, just never surfaced by curl-based checks.
      // CORS headers were already applied by the global plugin. Do not
      // reflect an arbitrary Origin here; production uses CORS_ORIGINS.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.raw.write(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);

      let replaying = cursor !== null;
      const buffered: SequencedLiveEvent[] = [];
      const unsubscribe = bus.subscribe(sessionId, (event) => {
        if (replaying) buffered.push(event);
        else writeEvent(reply, event);
      });

      if (cursor !== null) {
        let highWater = cursor;
        while (true) {
          const rows = await prisma.liveEvent.findMany({
            where: { sessionId, sequence: { gt: highWater } },
            include: { sport: { select: { slug: true } } },
            orderBy: { sequence: "asc" },
            take: REPLAY_BATCH_SIZE,
          });
          for (const row of rows) {
            const event = toTransportEvent(row);
            writeEvent(reply, event);
            highWater = row.sequence;
          }
          if (rows.length < REPLAY_BATCH_SIZE) break;
        }
        buffered
          .filter((event) => BigInt(event.sequence) > highWater)
          .sort((a, b) => (BigInt(a.sequence) < BigInt(b.sequence) ? -1 : 1))
          .forEach((event) => writeEvent(reply, event));
        replaying = false;
      }

      // Keep the connection alive through proxies that time out idle streams.
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat ${new Date().toISOString()}\n\n`);
      }, 15000);

      req.raw.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    },
  );
}
