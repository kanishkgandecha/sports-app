import type { FastifyInstance } from "fastify";
import { prisma, type Prisma } from "@sports/db";

const STATUSES = new Set(["scheduled", "live", "completed", "postponed", "cancelled"]);
type ArchiveQuery = {
  q?: string;
  season?: string;
  competition?: string;
  status?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: string;
  sport?: string;
};
type Cursor = { startTime: string; id: string };

/** Database-only F1 historical discovery. Providers are never called by page views. */
export async function archiveRoutes(app: FastifyInstance) {
  app.get<{ Querystring: ArchiveQuery }>("/api/archive/fixtures", async (req, reply) => {
    const parsed = parseQuery(req.query);
    if ("error" in parsed) return reply.code(400).send({ error: parsed.error });
    const { filters, limit, cursor } = parsed;
    const where: Prisma.FixtureWhereInput = {
      sport: { slug: "f1" },
      ...(filters.q ? { name: { contains: filters.q, mode: "insensitive" } } : {}),
      ...(filters.season ? { seasonId: filters.season } : {}),
      ...(filters.competition ? { competitionId: filters.competition } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.from || filters.to
        ? {
            startTime: {
              ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
              ...(filters.to ? { lt: nextUtcDay(filters.to) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { startTime: { lt: new Date(cursor.startTime) } },
              { startTime: new Date(cursor.startTime), id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const rows = await prisma.fixture.findMany({
      where,
      take: limit + 1,
      orderBy: [{ startTime: "desc" }, { id: "desc" }],
      include: { season: true, competition: true, venue: true, dataProfile: true },
    });
    const hasNextPage = rows.length > limit;
    const page = rows.slice(0, limit);
    const sessions = await prisma.session.findMany({
      where: { fixtureId: { in: page.map((row) => row.id) } },
      select: { id: true, fixtureId: true },
    });
    const fixtureBySession = new Map(sessions.map((session) => [session.id, session.fixtureId]));
    const detailRows = await prisma.driverTiming.findMany({
      where: { sessionId: { in: sessions.map((session) => session.id) } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    });
    const detailIds = new Set(
      detailRows.map((row) => fixtureBySession.get(row.sessionId)).filter((id): id is string => Boolean(id)),
    );
    const last = page.at(-1);
    return {
      fixtures: page.map((fixture) => ({
        id: fixture.id,
        name: fixture.name,
        status: fixture.status,
        startTime: fixture.startTime.toISOString(),
        season: { id: fixture.season.id, label: fixture.season.label },
        competition: {
          id: fixture.competition.id,
          slug: fixture.competition.slug,
          name: fixture.competition.name,
          type: fixture.competition.type,
        },
        venue: fixture.venue,
        coverage: fixture.dataProfile?.coverage ?? (detailIds.has(fixture.id) ? "event-data" : "summary"),
        source: fixture.dataProfile
          ? { provider: fixture.dataProfile.source, attribution: fixture.dataProfile.attribution }
          : null,
        detailAvailable: detailIds.has(fixture.id),
      })),
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? encodeCursor({ startTime: last.startTime.toISOString(), id: last.id }) : null,
      },
      appliedFilters: filters,
    };
  });

  app.get("/api/archive/options", async () => {
    const [seasons, competitions] = await Promise.all([
      prisma.season.findMany({
        where: { fixtures: { some: { sport: { slug: "f1" } } } },
        select: { id: true, label: true },
        orderBy: { label: "desc" },
      }),
      prisma.competition.findMany({
        where: { sport: { slug: "f1" }, fixtures: { some: {} } },
        select: { id: true, slug: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return { seasons, competitions };
  });
}

export function parseQuery(
  query: ArchiveQuery,
):
  | { error: string }
  | { filters: Omit<ArchiveQuery, "cursor" | "limit" | "sport">; limit: number; cursor: Cursor | null } {
  if (query.sport && query.sport !== "f1") return { error: "only Formula 1 archives are available" };
  if (query.status && !STATUSES.has(query.status)) return { error: "invalid status" };
  if (query.from && !isDate(query.from)) return { error: "from must be YYYY-MM-DD" };
  if (query.to && !isDate(query.to)) return { error: "to must be YYYY-MM-DD" };
  if (query.from && query.to && query.from > query.to) return { error: "from must not be after to" };
  const limit = query.limit === undefined ? 24 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) return { error: "limit must be an integer from 1 to 50" };
  let cursor: Cursor | null = null;
  if (query.cursor) {
    try {
      const value = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8")) as Cursor;
      if (
        !value ||
        typeof value.id !== "string" ||
        typeof value.startTime !== "string" ||
        Number.isNaN(Date.parse(value.startTime))
      )
        throw new Error();
      cursor = value;
    } catch {
      return { error: "invalid cursor" };
    }
  }
  const { cursor: _cursor, limit: _limit, sport: _sport, ...filters } = query;
  return { filters, limit, cursor };
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}
function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}
function nextUtcDay(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
