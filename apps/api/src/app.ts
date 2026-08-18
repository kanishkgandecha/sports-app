import Fastify from "fastify";
import cors from "@fastify/cors";
import { sportsRoutes } from "./routes/sports.js";
import { educationRoutes } from "./routes/education.js";
import { liveRoutes } from "./routes/live.js";
import { LiveEventBus } from "./liveEventBus.js";

export async function buildApp(databaseUrl: string) {
  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });

  app.get("/health", async () => ({ ok: true }));

  const bus = new LiveEventBus(databaseUrl);
  await bus.connect();

  await app.register(sportsRoutes);
  await app.register(educationRoutes);
  await app.register((instance) => liveRoutes(instance, bus));

  app.addHook("onClose", async () => {
    await bus.close();
  });

  return app;
}
