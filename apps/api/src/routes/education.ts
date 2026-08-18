import type { FastifyInstance } from "fastify";
import { getEducationIndex } from "../education.js";

export async function educationRoutes(app: FastifyInstance) {
  app.get<{ Params: { sport: string } }>("/api/education/:sport/concepts", async (req) => {
    const concepts = getEducationIndex().forSport(req.params.sport);
    return { concepts };
  });

  app.get<{ Params: { slug: string } }>("/api/education/concepts/:slug", async (req, reply) => {
    const index = getEducationIndex();
    const concept = index.get(req.params.slug);
    if (!concept) {
      return reply.code(404).send({ error: `No education concept "${req.params.slug}"` });
    }
    return {
      concept,
      related: index.related(concept.slug),
      precededBy: index.precededBy(concept.slug),
      followedBy: index.followedBy(concept.slug),
    };
  });
}
