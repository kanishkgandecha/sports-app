import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";

export async function sportsRoutes(app: FastifyInstance) {
  app.get("/api/sports", async () => {
    const sports = await prisma.sport.findMany({ orderBy: { slug: "asc" } });
    return { sports };
  });
}
