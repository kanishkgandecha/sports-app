import type { FastifyInstance } from "fastify";
import type { LiveEventBus } from "../liveEventBus.js";

/**
 * SSE delivery per ARCHITECTURE.md §4: one stream per session, fed by
 * LiveEventBus (which itself is fed by Postgres LISTEN/NOTIFY). This is the
 * Phase 0 exit criterion endpoint — a synthetic event reaching the browser
 * here in ~1s is what proves the pipeline before Phase 1 touches real F1
 * data.
 */
export async function liveRoutes(app: FastifyInstance, bus: LiveEventBus) {
  app.get<{ Params: { sessionId: string } }>(
    "/api/sessions/:sessionId/stream",
    async (req, reply) => {
      const { sessionId } = req.params;

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      reply.raw.write(`event: ready\ndata: {"sessionId":"${sessionId}"}\n\n`);

      const unsubscribe = bus.subscribe(sessionId, (event) => {
        reply.raw.write(`event: live-event\ndata: ${JSON.stringify(event)}\n\n`);
      });

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
