import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import { classifySessionLifecycle, computeFreshness, type FreshnessInfo } from "@sports/domain";

/**
 * Cricket read endpoints for the Event Center (Cricket Checkpoint 2 —
 * docs/CONTEXT.md). Same discipline as `apps/api/src/routes/f1.ts`:
 * normalized responses only, "API reads Postgres, ingestion writes it" —
 * nothing here ever calls CricketData.org live. That's not just an
 * architectural preference for Cricket specifically: it's what actually
 * respects the real, confirmed 100 requests/day rate limit (Checkpoint 1)
 * — every page load hitting the live provider would exhaust a day's
 * budget in minutes.
 *
 * `CricketInningsState`/`CricketBattingFigure`/`CricketBowlingFigure`/
 * `CricketFixtureDetail` have no Prisma relation to `Fixture`/`Session`/
 * `Player` (same Phase 0/Checkpoint 1 schema characteristic as F1's
 * `DriverTiming`/`PitStop`/`RaceControlMessage`) — player/team info is
 * joined in application code, same `xById` helper pattern `f1.ts` already
 * established.
 */
export async function cricketRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { status?: string } }>("/api/cricket/fixtures", async (req) => {
    const fixtures = await prisma.fixture.findMany({
      where: { sport: { slug: "cricket" }, ...(req.query.status ? { status: req.query.status } : {}) },
      orderBy: { startTime: "desc" },
      include: { venue: true, competition: true },
    });
    return { fixtures: fixtures.map(toFixtureSummary) };
  });

  app.get<{ Params: { fixtureId: string } }>("/api/cricket/fixtures/:fixtureId", async (req, reply) => {
    const fixture = await prisma.fixture.findFirst({
      where: { id: req.params.fixtureId, sport: { slug: "cricket" } },
      include: { venue: true, competition: true, sessions: { orderBy: { startTime: "asc" } } },
    });
    if (!fixture) {
      return reply.code(404).send({ error: `No Cricket fixture "${req.params.fixtureId}"` });
    }

    const detail = await prisma.cricketFixtureDetail.findUnique({ where: { fixtureId: fixture.id } });
    const teams = await teamsForFixture(fixture.sessions.map((s) => s.id));

    return {
      fixture: toFixtureSummary(fixture),
      sessions: fixture.sessions.map((s) => toSessionSummary(s)),
      detail: detail
        ? {
            format: detail.format,
            tossWonByTeam: detail.tossWonByTeamId ? (teams.get(detail.tossWonByTeamId) ?? unknownTeam(detail.tossWonByTeamId)) : null,
            tossDecision: detail.tossDecision,
            result: detail.result,
          }
        : null,
    };
  });

  app.get<{ Params: { sessionId: string } }>("/api/cricket/sessions/:sessionId", async (req, reply) => {
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, fixture: { sport: { slug: "cricket" } } },
      include: { fixture: { include: { venue: true, competition: true } } },
    });
    if (!session) {
      return reply.code(404).send({ error: `No Cricket session "${req.params.sessionId}"` });
    }
    const isLive = isCricketSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);
    return {
      session: toSessionSummary(session),
      fixture: toFixtureSummary(session.fixture),
      freshness,
    };
  });

  /**
   * Current score/overs/wickets/batsmen/bowler/target/required-run-rate —
   * reads `CricketInningsState` exactly as ingestion's
   * `getInningsState`/`upsertCricketInningsState` wrote it. Honestly `null`
   * when ingestion hasn't refreshed this innings yet (a real,
   * disclosed-not-fabricated state — see the checkpoint's "known
   * limitations" on refresh cadence), never a zeroed placeholder presented
   * as real.
   *
   * `strikerId`/`nonStrikerId` are surfaced as-is, in the real order the
   * provider gave them — Checkpoint 1's own limitation is real and stays
   * real here: this API does NOT claim to know which of the two is
   * actually on strike (the provider gives no such flag). The response key
   * is named `notOutBatsmen` (a plain array), not `striker`/`nonStriker`,
   * specifically so the frontend can't accidentally imply an ordering
   * claim the data doesn't support.
   */
  app.get<{ Params: { sessionId: string } }>("/api/cricket/sessions/:sessionId/innings", async (req, reply) => {
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, fixture: { sport: { slug: "cricket" } } },
    });
    if (!session) {
      return reply.code(404).send({ error: `No Cricket session "${req.params.sessionId}"` });
    }

    const state = await prisma.cricketInningsState.findUnique({ where: { sessionId: req.params.sessionId } });
    const isLive = isCricketSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    if (!state) {
      return { innings: null, freshness };
    }

    const teams = await teamsById([state.battingTeamId, state.bowlingTeamId]);
    const players = await playersById(
      [state.strikerId, state.nonStrikerId, state.currentBowlerId].filter((id): id is string => id !== null),
    );
    const notOutBatsmen = [state.strikerId, state.nonStrikerId]
      .filter((id): id is string => id !== null)
      .map((id) => players.get(id) ?? unknownPlayer(id));

    return {
      innings: {
        battingTeam: teams.get(state.battingTeamId) ?? unknownTeam(state.battingTeamId),
        bowlingTeam: teams.get(state.bowlingTeamId) ?? unknownTeam(state.bowlingTeamId),
        runs: state.runs,
        wickets: state.wickets,
        overs: state.overs,
        notOutBatsmen,
        currentBowler: state.currentBowlerId ? (players.get(state.currentBowlerId) ?? unknownPlayer(state.currentBowlerId)) : null,
        target: state.target,
        requiredRunRate: state.requiredRunRate,
      },
      freshness,
    };
  });

  /**
   * Batting scorecard + bowling figures — Checkpoint 2's real deliverable
   * (see `CricketBattingFigure`/`CricketBowlingFigure`'s doc comments in
   * `@sports/domain` for exactly which real fields these are and why no
   * more). `null` (not `[]`) when ingestion has never captured a
   * scorecard for this innings — verified real: `match_scorecard` can be
   * entirely unavailable even for a live match (Checkpoint 1 §1) — an
   * honest "we don't have this," not "we checked and there's nothing."
   */
  app.get<{ Params: { sessionId: string } }>("/api/cricket/sessions/:sessionId/scorecard", async (req, reply) => {
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, fixture: { sport: { slug: "cricket" } } },
    });
    if (!session) {
      return reply.code(404).send({ error: `No Cricket session "${req.params.sessionId}"` });
    }

    const [battingRows, bowlingRows] = await Promise.all([
      prisma.cricketBattingFigure.findMany({ where: { sessionId: req.params.sessionId }, orderBy: { battingOrder: "asc" } }),
      prisma.cricketBowlingFigure.findMany({ where: { sessionId: req.params.sessionId }, orderBy: { bowlingOrder: "asc" } }),
    ]);
    const isLive = isCricketSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    if (battingRows.length === 0 && bowlingRows.length === 0) {
      return { scorecard: null, freshness };
    }

    const players = await playersById([...battingRows.map((r) => r.playerId), ...bowlingRows.map((r) => r.playerId)]);

    return {
      scorecard: {
        batting: battingRows.map((row) => ({
          player: players.get(row.playerId) ?? unknownPlayer(row.playerId),
          runs: row.runs,
          balls: row.balls,
          fours: row.fours,
          sixes: row.sixes,
          strikeRate: row.strikeRate,
          dismissalText: row.dismissalText,
        })),
        bowling: bowlingRows.map((row) => ({
          player: players.get(row.playerId) ?? unknownPlayer(row.playerId),
          overs: row.overs,
          maidens: row.maidens,
          runsConceded: row.runsConceded,
          wickets: row.wickets,
          economy: row.economy,
        })),
      },
      freshness,
    };
  });

  /**
   * Ball-by-ball event feed — reads `LiveEvent` directly (unlike F1's
   * race-control, which reads a dedicated derived table): Cricket's real
   * events (`BALL`/`SCORE_UPDATE`/`WICKET`/`MATCH_STATUS` — Checkpoint 1
   * §2) are already exactly the shape a feed needs, normalized, with no
   * raw provider fields — a second derived table would just duplicate
   * what `LiveEvent` already is. Capped at 100, same as F1's race-control/
   * pit-stops endpoints.
   */
  app.get<{ Params: { sessionId: string } }>("/api/cricket/sessions/:sessionId/events", async (req, reply) => {
    const session = await prisma.session.findFirst({
      where: { id: req.params.sessionId, fixture: { sport: { slug: "cricket" } } },
    });
    if (!session) {
      return reply.code(404).send({ error: `No Cricket session "${req.params.sessionId}"` });
    }

    const events = await prisma.liveEvent.findMany({
      where: { sessionId: req.params.sessionId },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
    const isLive = isCricketSessionLive(session);
    const freshness = await getSessionFreshness(session.id, isLive);

    return {
      events: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        timestamp: e.timestamp.toISOString(),
        payload: e.payload,
      })),
      freshness,
    };
  });
}

/**
 * Cricket's own, longer max-session-duration — matches
 * `apps/ingestion/src/config.ts`'s `cricketMaxSessionDurationMs` default
 * (12 hours — a real Test innings can run most of a day's play, unlike
 * F1's 4-hour cap). Hardcoded here rather than imported from
 * `apps/ingestion` (apps don't depend on each other) — kept in sync by
 * being the same well-known real-world fact (cricket play length) both
 * independently encode, not by a shared import.
 */
const CRICKET_MAX_SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

/**
 * CricketData.org does not provide innings-specific timestamps. A completed
 * sibling and an active innings therefore share the match start time, so
 * Cricket's normalized per-innings status is authoritative; time remains a
 * stale-record safety bound. This intentionally differs from F1, where the
 * provider session time range is the authoritative lifecycle data.
 */
function isCricketSessionLive(session: { status: string; startTime: Date; endTime: Date | null }): boolean {
  return (
    session.status === "live" &&
    classifySessionLifecycle(
      { startTime: session.startTime.toISOString(), endTime: session.endTime ? session.endTime.toISOString() : null },
      new Date(),
      CRICKET_MAX_SESSION_DURATION_MS,
    ) === "live"
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

async function teamsById(teamIds: string[]) {
  const unique = [...new Set(teamIds)];
  const teams = await prisma.team.findMany({ where: { id: { in: unique } } });
  return new Map(teams.map((t) => [t.id, { id: t.id, name: t.name, colorHex: t.colorHex }]));
}

/** A fixture's two teams, resolved from whichever innings sessions it has a real CricketInningsState for — used only for `tossWonByTeam` display on the fixture-detail route. */
async function teamsForFixture(sessionIds: string[]) {
  if (sessionIds.length === 0) return new Map<string, { id: string; name: string; colorHex: string | null }>();
  const states = await prisma.cricketInningsState.findMany({ where: { sessionId: { in: sessionIds } } });
  const teamIds = [...new Set(states.flatMap((s) => [s.battingTeamId, s.bowlingTeamId]))];
  return teamsById(teamIds);
}

function unknownTeam(teamId: string) {
  return { id: teamId, name: teamId, colorHex: null };
}

async function playersById(playerIds: string[]) {
  const unique = [...new Set(playerIds)];
  const players = await prisma.player.findMany({ where: { id: { in: unique } } });
  return new Map(players.map((p) => [p.id, { id: p.id, name: p.name, shortName: p.shortName, avatarUrl: p.avatarUrl }]));
}

/** A batting/bowling/innings-state row can reference a playerId ingestion hasn't bootstrapped a Player row for yet — never drop the row, degrade gracefully instead (same posture as F1's `unknownDriver`). */
function unknownPlayer(playerId: string) {
  return { id: playerId, name: playerId, shortName: null, avatarUrl: null };
}

/**
 * Cricket Checkpoint 3 — `competition` added to the fixture summary
 * (previously venue-only). Real, already-related data (`Fixture.
 * competitionId` has pointed at a real `Competition` row since Checkpoint
 * 1's bootstrap; nothing new is derived or guessed) that the landing
 * page's brief explicitly asks to surface "when it already exists" —
 * unlike F1 (one championship, so competition context was never
 * interesting there), Cricket's real data spans genuinely different
 * competitions (a bilateral T20I series, an ODI tour, a domestic T20
 * league), so this is meaningfully new information, not decoration.
 */
function toFixtureSummary(fixture: {
  id: string;
  slug: string;
  name: string;
  status: string;
  startTime: Date;
  venue: { id: string; name: string; country: string | null; timezone: string } | null;
  competition: { id: string; name: string; type: string } | null;
}) {
  return {
    id: fixture.id,
    slug: fixture.slug,
    name: fixture.name,
    status: fixture.status,
    startTime: fixture.startTime.toISOString(),
    venue: fixture.venue,
    // Picked explicitly, not `competition: fixture.competition` — a real
    // contract leak found in review (Cricket Checkpoint 4): the Prisma
    // `Competition` row also carries `sportId`/`slug`, neither of which
    // has any product meaning to a client, and a bare passthrough put
    // both in every fixture-shaped response body. `venue` has no such
    // extra columns to leak today, but is left as a passthrough
    // deliberately unchanged here rather than touched speculatively.
    competition: fixture.competition
      ? { id: fixture.competition.id, name: fixture.competition.name, type: fixture.competition.type }
      : null,
  };
}

function toSessionSummary(session: { id: string; type: string; status: string; startTime: Date; endTime: Date | null }) {
  return {
    id: session.id,
    type: session.type,
    status: session.status,
    lifecycle: isCricketSessionLive(session)
      ? "live"
      : session.status === "scheduled"
        ? "upcoming"
        : "completed",
    startTime: session.startTime.toISOString(),
    endTime: session.endTime ? session.endTime.toISOString() : null,
  };
}
