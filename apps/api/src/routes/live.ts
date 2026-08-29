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

/** Mirrors exactly what `@fastify/cors` would set for an allowed, exact-match origin (never a wildcard — see readApiConfig's own rejection of "*"). */
export function corsHeadersFor(origin: string | undefined, allowedOrigins: string[]): Record<string, string> {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}

/**
 * Disables Node's per-socket idle timeout for one long-lived SSE
 * connection, without touching the Fastify instance's global
 * `connectionTimeout` (which every other, ordinary request/response route
 * keeps). Extracted so the "did we actually call setTimeout(0)" behavior
 * is unit-testable against a plain mock — the timeout itself (10s,
 * shorter than this file's 15s heartbeat) only reproduces by holding a
 * real connection open for that long, which is what real-browser
 * verification did (see the call site's doc comment).
 */
export function disableIdleTimeout(socket: { setTimeout: (ms: number) => void } | null | undefined): void {
  socket?.setTimeout(0);
}

/**
 * SSE delivery per ARCHITECTURE.md §4: one stream per session, fed by
 * LiveEventBus (which itself is fed by Postgres LISTEN/NOTIFY).
 */
export async function liveRoutes(app: FastifyInstance, bus: LiveEventBus, corsOrigins: string[]) {
  app.get<{ Params: { sessionId: string }; Querystring: { after?: string } }>(
    "/api/sessions/:sessionId/stream",
    async (req, reply) => {
      const { sessionId } = req.params;
      const cursor = parseCursor(req.query.after ?? req.headers["last-event-id"]);
      if (cursor === "invalid") {
        return reply.code(400).send({ error: "after/Last-Event-ID must be a non-negative integer" });
      }

      // Writing straight to the raw Node response (below) bypasses
      // Fastify's normal reply lifecycle entirely, which is where
      // `@fastify/cors` (registered globally in app.ts) injects
      // Access-Control-Allow-* headers on every other route — it never
      // runs for a handler that calls `reply.raw.writeHead()` directly.
      // Phase 6's real-browser SSE verification (the first time this
      // stream was ever opened from an actual browser tab against a live
      // session — Phase 5 had none to test with) found this stream
      // genuinely had no CORS header at all: a plain `curl` never
      // surfaces this (curl doesn't enforce CORS), which is exactly how
      // it went unnoticed. `corsHeadersFor` reproduces `@fastify/cors`'s
      // own allowed-origin-reflection behavior from the same
      // `corsOrigins` config the global plugin uses — never an arbitrary
      // reflected Origin, only one already on that allowlist.
      // The same real-browser SSE verification found a second bug this
      // one made visible: `buildApp`'s Fastify instance sets a global
      // `connectionTimeout: 10_000` (Node's per-socket idle timeout,
      // meant to drop slow/abandoned *connecting* clients on ordinary
      // request/response routes). It applies to every socket by default,
      // including this one — and it's *shorter* than the 15-second
      // heartbeat below, so the socket was being killed by Node itself
      // roughly every 10 seconds, well before a heartbeat could ever keep
      // it alive, which the browser reported as
      // `net::ERR_INCOMPLETE_CHUNKED_ENCODING` and `useLiveSession`
      // dutifully reconnected from (a ~13s cycle: 10s idle timeout + the
      // hook's 3s reconnect delay — confirmed against the container's
      // request log). `socket.setTimeout(0)` disables Node's idle timeout
      // for *this one* long-lived connection only; every other route
      // keeps the global 10-second connectionTimeout unchanged.
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...corsHeadersFor(req.headers.origin, corsOrigins),
      });
      reply.raw.write(`event: ready\ndata: ${JSON.stringify({ sessionId })}\n\n`);
      // Establishing the raw response can reapply `server.timeout` on
      // Linux, so disable it only after the SSE headers/body are live.
      disableIdleTimeout(req.raw.socket);

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
