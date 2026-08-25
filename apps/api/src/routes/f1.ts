import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import { classifySessionLifecycle, computeFreshness, type FreshnessInfo } from "@sports/domain";

/**
 * F1 read endpoints for the Event Center (Checkpoint 5 — docs/CONTEXT.md
 * §10). Normalized responses only: Prisma models and OpenF1 response shapes
 * never reach the frontend directly (this checkpoint's explicit rule,
 * continuing the provider-boundary discipline from Checkpoints 3-4).
 *
 * `DriverTiming`/`PitStop`/`RaceControlMessage` have no Prisma relation to
 * `Player` (a Phase 0/Checkpoint 2 schema characteristic — see
 * schema.prisma's comments on those models), so driver info is joined in
 * application code: fetch the timing/pit rows, collect the driverIds
 * involved, fetch matching `Player` rows once, merge.
 */
export async function f1Routes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string; limit?: string; order?: string } }>(
    "/api/f1/fixtures",
    async (req, reply) => {
      const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        return reply.code(400).send({ error: "limit must be from 1 to 100" });
      if (req.query.order && req.query.order !== "asc" && req.query.order !== "desc")
        return reply.code(400).send({ error: "order must be asc or desc" });
      const order: "asc" | "desc" = req.query.order === "asc" ? "asc" : "desc";
      const fixtures = await prisma.fixture.findMany({
        where: { sport: { slug: "f1" }, ...(req.query.status ? { status: req.query.status } : {}) },
        orderBy: { startTime: order },
        take: limit,
        include: { venue: true, sessions: { select: { id: true } } },
      });
      const detailIds = await detailedF1SessionIds(fixtures.flatMap((fixture) => fixture.sessions.map((s) => s.id)));
      return {
        fixtures: fixtures.map((fixture) =>
          toFixtureSummary(
            fixture,
            fixture.sessions.some((session) => detailIds.has(session.id)),
          ),
        ),
      };
    },
  );

  app.get<{ Params: { fixtureId: string } }>("/api/f1/fixtures/:fixtureId", async (req, reply) => {
    const fixture = await prisma.fixture.findFirst({
      where: { id: req.params.fixtureId, sport: { slug: "f1" } },
      include: { venue: true, sessions: { orderBy: { startTime: "asc" } } },
    });
    if (!fixture) {
      // Also correctly 404s for a real fixture id belonging to a different
      // sport — this route is F1-only, not "any fixture."
      return reply.code(404).send({ error: `No F1 fixture "${req.params.fixtureId}"` });
    }
    const detailIds = await detailedF1SessionIds(fixture.sessions.map((session) => session.id));
    return {
      fixture: toFixtureSummary(
        fixture,
        fixture.sessions.some((session) => detailIds.has(session.id)),
      ),
      sessions: fixture.sessions.map((session) => toSessionSummary(session, detailIds.has(session.id))),
    };
  });

  app.get<{ Params: { sessionId: string } }>("/api/f1/sessions/:sessionId", async (req, reply) => {
    const session = await prisma.session.findUnique({
      where: { id: req.params.sessionId },
      include: { fixture: { include: { venue: true } } },
    });
    if (!session) {
      return reply.code(404).send({ error: `No session "${req.params.sessionId}"` });
    }
    const isLive = isSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);
    const detailIds = await detailedF1SessionIds([session.id]);
    return {
      session: toSessionSummary(session, detailIds.has(session.id)),
      fixture: toFixtureSummary(session.fixture, detailIds.has(session.id)),
      freshness,
    };
  });

  app.get<{ Params: { sessionId: string } }>("/api/f1/sessions/:sessionId/timing", async (req, reply) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
    if (!session) {
      return reply.code(404).send({ error: `No session "${req.params.sessionId}"` });
    }

    const rows = await prisma.driverTiming.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { position: "asc" },
    });
    const drivers = await driversById(rows.map((r) => r.driverId));

    const isLive = isSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    return {
      timing: rows.map((row) => ({
        position: row.position,
        driver: drivers.get(row.driverId) ?? unknownDriver(row.driverId),
        gapToLeader: row.gapToLeader,
        intervalToAhead: row.intervalToAhead,
        lastLapTime: row.lastLapTime,
        bestLapTime: row.bestLapTime,
        sector1: row.sector1,
        sector2: row.sector2,
        sector3: row.sector3,
        tyreCompound: row.tyreCompound,
        state: row.state,
      })),
      freshness,
    };
  });

  app.get<{ Params: { sessionId: string } }>("/api/f1/sessions/:sessionId/race-control", async (req, reply) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
    if (!session) {
      return reply.code(404).send({ error: `No session "${req.params.sessionId}"` });
    }

    const messages = await prisma.raceControlMessage.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: "desc" },
      take: 100,
    });

    const isLive = isSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    return {
      messages: messages.map((m) => ({
        id: m.id,
        timestamp: m.timestamp.toISOString(),
        category: m.category,
        message: m.message,
      })),
      freshness,
    };
  });

  /**
   * Checkpoint 6 — championship standings, sourced from the `Standing` table
   * the ingestion worker's Jolpica-F1 standings sync writes to (see
   * apps/ingestion/src/f1/standings.ts), never fetched live from Jolpica on
   * request — same "API reads Postgres, ingestion writes it" shape every
   * other F1 endpoint in this file already follows. Normalized response
   * only: no raw Jolpica/`constructorId`/Prisma shapes reach the frontend.
   *
   * `wins`/`teamId` live in `Standing.extra` (a `Json` column, provider-
   * specific by design — see @sports/domain's `Standing` type) — read
   * defensively since nothing guarantees its shape at the DB level.
   *
   * No movement/position-change field: this checkpoint's explicit rule is
   * "do NOT fabricate position movement, omit if unavailable" — the
   * `Standing` table only ever holds the current snapshot (upserted in
   * place, see standings.ts), so a truthful "moved up 2 places since last
   * race" isn't calculable from what's actually stored. Omitted, not faked.
   */
  app.get<{ Params: { year: string } }>("/api/f1/seasons/:year/standings/drivers", async (req, reply) => {
    const season = await findF1Season(req.params.year);
    if (!season) {
      return reply.code(404).send({ error: `No F1 season "${req.params.year}"` });
    }

    const rows = await prisma.standing.findMany({
      where: { seasonId: season.id, entityType: "player" },
      orderBy: { position: "asc" },
    });
    const drivers = await driversById(rows.map((r) => r.entityId));
    const teams = await teamsById(rows.map((r) => extraTeamId(r.extra)).filter((id): id is string => id !== null));

    return {
      season: { year: season.label, id: season.id },
      standings: rows.map((row) => {
        const driver = drivers.get(row.entityId) ?? unknownDriver(row.entityId);
        const teamId = extraTeamId(row.extra);
        return {
          position: row.position,
          points: row.points,
          wins: extraWins(row.extra),
          driver: { id: driver.id, name: driver.name, shortName: driver.shortName, avatarUrl: driver.avatarUrl },
          team: (teamId ? teams.get(teamId) : undefined) ?? driver.team ?? null,
        };
      }),
    };
  });

  app.get<{ Params: { year: string } }>("/api/f1/seasons/:year/standings/constructors", async (req, reply) => {
    const season = await findF1Season(req.params.year);
    if (!season) {
      return reply.code(404).send({ error: `No F1 season "${req.params.year}"` });
    }

    const rows = await prisma.standing.findMany({
      where: { seasonId: season.id, entityType: "team" },
      orderBy: { position: "asc" },
    });
    const teams = await teamsById(rows.map((r) => r.entityId));

    return {
      season: { year: season.label, id: season.id },
      standings: rows.map((row) => ({
        position: row.position,
        points: row.points,
        wins: extraWins(row.extra),
        team: teams.get(row.entityId) ?? { id: row.entityId, name: row.entityId, colorHex: null },
      })),
    };
  });

  app.get<{ Params: { sessionId: string } }>("/api/f1/sessions/:sessionId/pit-stops", async (req, reply) => {
    const session = await prisma.session.findUnique({ where: { id: req.params.sessionId } });
    if (!session) {
      return reply.code(404).send({ error: `No session "${req.params.sessionId}"` });
    }

    const stops = await prisma.pitStop.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    const drivers = await driversById(stops.map((s) => s.driverId));

    const isLive = isSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    return {
      pitStops: stops.map((stop) => ({
        id: stop.id,
        driver: drivers.get(stop.driverId) ?? unknownDriver(stop.driverId),
        lap: stop.lap,
        durationMs: stop.durationMs,
        timestamp: stop.timestamp.toISOString(),
      })),
      freshness,
    };
  });
}

/** `classifySessionLifecycle` takes ISO strings; Prisma returns `Date` objects — this bridges the two consistently at every call site. */
function isSessionLive(session: { startTime: Date; endTime: Date | null }): boolean {
  return (
    classifySessionLifecycle({
      startTime: session.startTime.toISOString(),
      endTime: session.endTime ? session.endTime.toISOString() : null,
    }) === "live"
  );
}

async function getSessionFreshness(sessionId: string, isLive: boolean): Promise<FreshnessInfo> {
  const latest = await prisma.liveEvent.findFirst({
    where: { sessionId },
    orderBy: { timestamp: "desc" },
    select: { timestamp: true },
  });
  return computeFreshness({ lastEventAt: latest?.timestamp.toISOString() ?? null, isLive });
}

/** Standings are scoped by year via the real Season row, not a reconstructed `f1-season-{year}` id string — keeps this route from having to know any provider's id-building convention. */
async function findF1Season(year: string) {
  return prisma.season.findFirst({
    where: { label: year, competition: { slug: "f1-world-championship" } },
  });
}

async function teamsById(teamIds: string[]) {
  const unique = [...new Set(teamIds)];
  const teams = await prisma.team.findMany({ where: { id: { in: unique } } });
  return new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, colorHex: t.colorHex }]));
}

/** `Standing.extra` is an untyped `Json` column (provider-specific by design — see @sports/domain's `Standing` type) — read defensively, never assume a shape the DB doesn't enforce. */
function extraWins(extra: unknown): number | null {
  if (typeof extra !== "object" || extra === null || !("wins" in extra)) return null;
  const wins = (extra as { wins: unknown }).wins;
  return typeof wins === "number" ? wins : null;
}

function extraTeamId(extra: unknown): string | null {
  if (typeof extra !== "object" || extra === null || !("teamId" in extra)) return null;
  const teamId = (extra as { teamId: unknown }).teamId;
  return typeof teamId === "string" ? teamId : null;
}

async function driversById(driverIds: string[]) {
  const unique = [...new Set(driverIds)];
  const players = await prisma.player.findMany({
    where: { id: { in: unique } },
    include: { team: true },
  });
  return new Map(
    players.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        shortName: p.shortName,
        avatarUrl: p.avatarUrl,
        team: p.team ? { id: p.team.id, name: p.team.name, colorHex: p.team.colorHex } : null,
      },
    ]),
  );
}

/** A timing/pit row can reference a driverId ingestion hasn't bootstrapped a Player row for yet (e.g. a mid-poll race) — never drop the row, degrade gracefully instead. */
function unknownDriver(driverId: string) {
  return { id: driverId, name: driverId, shortName: null, avatarUrl: null, team: null };
}

function toFixtureSummary(
  fixture: {
    id: string;
    slug: string;
    name: string;
    status: string;
    startTime: Date;
    venue: { id: string; name: string; country: string; timezone: string } | null;
  },
  detailAvailable = false,
) {
  return {
    id: fixture.id,
    slug: fixture.slug,
    name: fixture.name,
    status: fixture.status,
    startTime: fixture.startTime.toISOString(),
    venue: fixture.venue,
    detailAvailable,
  };
}

function toSessionSummary(
  session: {
    id: string;
    type: string;
    status: string;
    startTime: Date;
    endTime: Date | null;
  },
  detailAvailable = false,
) {
  return {
    id: session.id,
    type: session.type,
    status: session.status,
    lifecycle: classifySessionLifecycle({
      startTime: session.startTime.toISOString(),
      endTime: session.endTime ? session.endTime.toISOString() : null,
    }),
    startTime: session.startTime.toISOString(),
    endTime: session.endTime ? session.endTime.toISOString() : null,
    detailAvailable,
  };
}

async function detailedF1SessionIds(sessionIds: string[]): Promise<Set<string>> {
  if (sessionIds.length === 0) return new Set();
  const [timing, pits, raceControl, events] = await Promise.all([
    prisma.driverTiming.findMany({
      where: { sessionId: { in: sessionIds } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.pitStop.findMany({
      where: { sessionId: { in: sessionIds } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.raceControlMessage.findMany({
      where: { sessionId: { in: sessionIds } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.liveEvent.findMany({
      where: { sessionId: { in: sessionIds } },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
  ]);
  return new Set([...timing, ...pits, ...raceControl, ...events].map((row) => row.sessionId));
}
