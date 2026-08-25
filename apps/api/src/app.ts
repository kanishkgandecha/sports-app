import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { sportsRoutes } from "./routes/sports.js";
import { educationRoutes } from "./routes/education.js";
import { liveRoutes } from "./routes/live.js";
import { f1Routes } from "./routes/f1.js";
import { archiveRoutes } from "./routes/archive.js";
import { LiveEventBus } from "./liveEventBus.js";
import { prisma } from "@sports/db";
import { readApiConfig } from "./config.js";

export async function buildApp(databaseUrl: string) {
  const config = readApiConfig();
  const app = Fastify({
    bodyLimit: config.bodyLimitBytes,
    requestTimeout: 15_000,
    connectionTimeout: 10_000,
    logger: {
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", "req.headers.x-api-key"],
        censor: "[REDACTED]",
      },
    },
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigins });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: "1 minute" });

  app.get("/health", async () => ({ ok: true }));
  app.get("/health/live", async () => ({ ok: true }));

  const bus = new LiveEventBus(databaseUrl);
  await bus.connect();

  app.get("/health/ready", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (!bus.isConnected) throw new Error("live event listener disconnected");
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  await app.register(sportsRoutes);
  await app.register(educationRoutes);
  await app.register(f1Routes);
  await app.register(archiveRoutes);
  await app.register((instance) => liveRoutes(instance, bus));

  app.addHook("onClose", async () => {
    await bus.close();
  });

  return app;
}
