import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import { buildApp } from "../app";

/**
 * Integration tests — real local Postgres (same one `docker compose up`
 * starts), a real Fastify app via `app.inject()` (no separate server
 * process needed). Seeds a small, realistic F1 fixture/session/timing
 * dataset with deterministic test-only ids, cleaned up after.
 */
const SPORT_SLUG = "f1"; // reuses the real seeded F1 sport row, not a test-only one — routes filter by sport slug "f1" directly
const FIXTURE_ID = "api-test-fixture";
const SESSION_ID = "api-test-session";
const LIVE_SESSION_ID = "api-test-session-live";
const DRIVER_ID = "api-test-driver-1";
const UNKNOWN_DRIVER_ID = "api-test-driver-unbootstrapped";
const TEAM_ID = "api-test-team-1";

// Checkpoint 6 — standings tests must go through the real
// "f1-world-championship" competition (Competition.slug is only unique per
// sport, and `/seasons/:year/standings/*` looks seasons up via that real
// slug, exactly as production data does — see f1.ts's `findF1Season`), with
// a test-only season label ("2091") that can't collide with any real
// bootstrapped season year.
const STANDINGS_SEASON_LABEL = "2091";
const STANDINGS_SEASON_ID = "api-test-standings-season";
const STANDINGS_DRIVER_ID = "api-test-standings-driver-1";
const STANDINGS_DRIVER_UNKNOWN_ID = "api-test-standings-driver-unbootstrapped";
const STANDINGS_TEAM_ID = "api-test-standings-team-1";

let app: FastifyInstance;

async function seed() {
  const sport = await prisma.sport.upsert({
    where: { slug: SPORT_SLUG },
    update: {},
    create: { slug: SPORT_SLUG, name: "Formula 1", status: "beta" },
  });
  const competition = await prisma.competition.upsert({
    where: { id: "api-test-competition" },
    update: {},
    create: {
      id: "api-test-competition",
      sportId: sport.id,
      slug: "api-test-competition",
      name: "Test Championship",
      type: "championship",
    },
  });
  const season = await prisma.season.upsert({
    where: { id: "api-test-season" },
    update: {},
    create: {
      id: "api-test-season",
      competitionId: competition.id,
      label: "2099",
      startDate: new Date("2099-01-01"),
      endDate: new Date("2099-12-31"),
    },
  });
  const venue = await prisma.venue.upsert({
    where: { id: "api-test-venue" },
    update: {},
    create: { id: "api-test-venue", name: "Test Circuit", country: "Testland", timezone: "+00:00" },
  });
  await prisma.fixture.upsert({
    where: { id: FIXTURE_ID },
    update: {},
    create: {
      id: FIXTURE_ID,
      sportId: sport.id,
      competitionId: competition.id,
      seasonId: season.id,
      slug: "api-test-grand-prix-2099",
      name: "Test Grand Prix",
      status: "scheduled",
      startTime: new Date("2099-01-01T00:00:00Z"),
      venueId: venue.id,
    },
  });
  // A completed session — used for timing/race-control/pit-stops assertions.
  await prisma.session.upsert({
    where: { id: SESSION_ID },
    update: {},
    create: {
      id: SESSION_ID,
      fixtureId: FIXTURE_ID,
      type: "RACE",
      status: "completed",
      startTime: new Date("2020-01-01T00:00:00Z"),
      endTime: new Date("2020-01-01T02:00:00Z"),
    },
  });
  await prisma.sessionDataProfile.upsert({
    where: { sessionId: SESSION_ID },
    update: { status: "available", reason: null },
    create: {
      sessionId: SESSION_ID,
      source: "openf1",
      status: "available",
      attemptCount: 1,
      importedAt: new Date("2020-01-01T02:01:00Z"),
    },
  });
  // A currently-live session — used for freshness/lifecycle assertions.
  await prisma.session.upsert({
    where: { id: LIVE_SESSION_ID },
    update: {},
    create: {
      id: LIVE_SESSION_ID,
      fixtureId: FIXTURE_ID,
      type: "QUALIFYING",
      status: "live",
      startTime: new Date(Date.now() - 5 * 60 * 1000),
      endTime: new Date(Date.now() + 55 * 60 * 1000),
    },
  });

  await prisma.team.upsert({
    where: { id: TEAM_ID },
    update: {},
    create: {
      id: TEAM_ID,
      sportId: sport.id,
      name: "Test Racing",
      slug: "api-test-racing",
      country: null,
      colorHex: "#112233",
    },
  });
  await prisma.player.upsert({
    where: { id: DRIVER_ID },
    update: {},
    create: {
      id: DRIVER_ID,
      sportId: sport.id,
      teamId: TEAM_ID,
      name: "Test Driver",
      role: "driver",
      shortName: "TST",
      avatarUrl: null,
    },
  });

  await prisma.driverTiming.upsert({
    where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: DRIVER_ID } },
    update: {},
    create: {
      sessionId: SESSION_ID,
      driverId: DRIVER_ID,
      position: 1,
      gapToLeader: "0.000",
      intervalToAhead: null,
      lastLapTime: 88.123,
      bestLapTime: 87.5,
      sector1: 28.1,
      sector2: 29.2,
      sector3: 30.4,
      tyreCompound: "SOFT",
      state: "running",
    },
  });
  // A timing row for a driver with no bootstrapped Player row — tests the "unknown driver" fallback.
  await prisma.driverTiming.upsert({
    where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: UNKNOWN_DRIVER_ID } },
    update: {},
    create: { sessionId: SESSION_ID, driverId: UNKNOWN_DRIVER_ID, position: 2, state: "running" },
  });

  await prisma.raceControlMessage.upsert({
    where: { id: "api-test-rc-1" },
    update: {},
    create: {
      id: "api-test-rc-1",
      sessionId: SESSION_ID,
      timestamp: new Date("2020-01-01T00:30:00Z"),
      category: "safety_car",
      message: "SAFETY CAR DEPLOYED",
    },
  });

  await prisma.pitStop.upsert({
    where: { id: "api-test-pit-1" },
    update: {},
    create: {
      id: "api-test-pit-1",
      sessionId: SESSION_ID,
      driverId: DRIVER_ID,
      lap: 12,
      durationMs: 23500,
      timestamp: new Date("2020-01-01T00:45:00Z"),
    },
  });

  await prisma.sessionClassification.upsert({
    where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: DRIVER_ID } },
    update: {},
    create: {
      id: "api-test-result-1",
      sessionId: SESSION_ID,
      driverId: DRIVER_ID,
      position: 1,
      status: "classified",
      lapsCompleted: 44,
      points: 25,
      durationSeconds: 4930.2,
      gapToLeader: "0.000",
    },
  });
  await prisma.lap.upsert({
    where: { sessionId_driverId_lapNumber: { sessionId: SESSION_ID, driverId: DRIVER_ID, lapNumber: 5 } },
    update: {},
    create: {
      id: "api-test-lap-1",
      sessionId: SESSION_ID,
      driverId: DRIVER_ID,
      lapNumber: 5,
      startedAt: new Date("2020-01-01T00:10:00Z"),
      duration: 87.5,
      sector1: 28.1,
      sector2: 29.2,
      sector3: 30.2,
      speedI1: 250,
      speedI2: 270,
      speedTrap: 310,
      isPitOutLap: false,
    },
  });
  await prisma.tyreStint.upsert({
    where: { sessionId_driverId_stintNumber: { sessionId: SESSION_ID, driverId: DRIVER_ID, stintNumber: 1 } },
    update: {},
    create: {
      id: "api-test-stint-1",
      sessionId: SESSION_ID,
      driverId: DRIVER_ID,
      stintNumber: 1,
      lapStart: 1,
      lapEnd: 20,
      compound: "SOFT",
      tyreAgeAtStart: 0,
    },
  });

  await seedStandings();
}

/**
 * Seeded through the *real* "f1-world-championship" Competition row (upsert
 * with `update: {}` — never overwrites real data), the way production
 * standings data actually arrives (see apps/ingestion/src/f1/standings.ts).
 */
async function seedStandings() {
  const sport = await prisma.sport.upsert({
    where: { slug: SPORT_SLUG },
    update: {},
    create: { slug: SPORT_SLUG, name: "Formula 1", status: "beta" },
  });
  await prisma.competition.upsert({
    where: { id: "f1-world-championship" },
    update: {},
    create: {
      id: "f1-world-championship",
      sportId: sport.id,
      slug: "f1-world-championship",
      name: "FIA Formula One World Championship",
      type: "championship",
    },
  });
  await prisma.season.upsert({
    where: { id: STANDINGS_SEASON_ID },
    update: {},
    create: {
      id: STANDINGS_SEASON_ID,
      competitionId: "f1-world-championship",
      label: STANDINGS_SEASON_LABEL,
      startDate: new Date("2091-01-01"),
      endDate: new Date("2091-12-31"),
    },
  });
  await prisma.team.upsert({
    where: { id: STANDINGS_TEAM_ID },
    update: {},
    create: {
      id: STANDINGS_TEAM_ID,
      sportId: sport.id,
      name: "Standings Test Racing",
      slug: "standings-test-racing",
      country: null,
      colorHex: "#445566",
    },
  });
  await prisma.player.upsert({
    where: { id: STANDINGS_DRIVER_ID },
    update: {},
    create: {
      id: STANDINGS_DRIVER_ID,
      sportId: sport.id,
      teamId: STANDINGS_TEAM_ID,
      name: "Standings Test Driver",
      role: "driver",
      shortName: "STD",
      avatarUrl: null,
    },
  });

  await prisma.standing.upsert({
    where: {
      seasonId_entityType_entityId: {
        seasonId: STANDINGS_SEASON_ID,
        entityType: "player",
        entityId: STANDINGS_DRIVER_ID,
      },
    },
    update: {},
    create: {
      competitionId: "f1-world-championship",
      seasonId: STANDINGS_SEASON_ID,
      entityType: "player",
      entityId: STANDINGS_DRIVER_ID,
      points: 150,
      position: 1,
      extra: { wins: 4, teamId: STANDINGS_TEAM_ID },
    },
  });
  // A standing for a driver with no bootstrapped Player row — tests the "unknown driver" fallback, same as the timing endpoint.
  await prisma.standing.upsert({
    where: {
      seasonId_entityType_entityId: {
        seasonId: STANDINGS_SEASON_ID,
        entityType: "player",
        entityId: STANDINGS_DRIVER_UNKNOWN_ID,
      },
    },
    update: {},
    create: {
      competitionId: "f1-world-championship",
      seasonId: STANDINGS_SEASON_ID,
      entityType: "player",
      entityId: STANDINGS_DRIVER_UNKNOWN_ID,
      points: 90,
      position: 2,
      extra: {},
    },
  });
  await prisma.standing.upsert({
    where: {
      seasonId_entityType_entityId: { seasonId: STANDINGS_SEASON_ID, entityType: "team", entityId: STANDINGS_TEAM_ID },
    },
    update: {},
    create: {
      competitionId: "f1-world-championship",
      seasonId: STANDINGS_SEASON_ID,
      entityType: "team",
      entityId: STANDINGS_TEAM_ID,
      points: 240,
      position: 1,
      extra: { wins: 6 },
    },
  });
}

async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  await prisma.sessionClassification.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.lap.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.tyreStint.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.driverTiming.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.pitStop.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.raceControlMessage.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.liveEvent.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.session.deleteMany({ where: { id: { in: [SESSION_ID, LIVE_SESSION_ID] } } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.player.deleteMany({ where: { id: DRIVER_ID } });
  await prisma.team.deleteMany({ where: { id: TEAM_ID } });
  await prisma.season.deleteMany({ where: { id: "api-test-season" } });
  await prisma.competition.deleteMany({ where: { id: "api-test-competition" } });

  // Standings cleanup — never deletes the real "f1-world-championship"
  // Competition row itself (shared with real bootstrapped data), only this
  // test's own season/team/player/standing rows.
  await prisma.standing.deleteMany({ where: { seasonId: STANDINGS_SEASON_ID } });
  await prisma.season.deleteMany({ where: { id: STANDINGS_SEASON_ID } });
  await prisma.player.deleteMany({ where: { id: { in: [STANDINGS_DRIVER_ID, STANDINGS_DRIVER_UNKNOWN_ID] } } });
  await prisma.team.deleteMany({ where: { id: STANDINGS_TEAM_ID } });
}

describe("F1 routes (integration, real Postgres)", () => {
  beforeAll(async () => {
    await cleanup();
    await seed();
    app = await buildApp(process.env.DATABASE_URL!);
  });
  afterAll(async () => {
    if (app) await app.close();
    await cleanup();
  });

  it("GET /api/f1/fixtures includes the seeded fixture with its venue", async () => {
    const res = await app.inject({ method: "GET", url: "/api/f1/fixtures" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const fixture = body.fixtures.find((f: { id: string }) => f.id === FIXTURE_ID);
    expect(fixture).toBeDefined();
    expect(fixture.venue).toMatchObject({ name: "Test Circuit" });
    expect(fixture.detailAvailable).toBe(true);
  });

  it("GET /api/f1/fixtures/:id returns the fixture with all of its sessions, ordered", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/fixtures/${FIXTURE_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fixture.id).toBe(FIXTURE_ID);
    expect(body.sessions.map((s: { id: string }) => s.id)).toEqual([SESSION_ID, LIVE_SESSION_ID]);
    expect(body.fixture.detailAvailable).toBe(true);
    expect(body.sessions).toEqual([
      expect.objectContaining({ id: SESSION_ID, detailAvailable: true, detailStatus: "available" }),
      expect.objectContaining({ id: LIVE_SESSION_ID, detailAvailable: false, detailStatus: "summary" }),
    ]);
  });

  it("GET /api/f1/fixtures/:id 404s for an unknown fixture rather than returning null fields", async () => {
    const res = await app.inject({ method: "GET", url: "/api/f1/fixtures/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/f1/sessions/:id reports lifecycle=completed and freshness=offline for a session that isn't live", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.session.lifecycle).toBe("completed");
    expect(body.session.detailAvailable).toBe(true);
    expect(body.freshness.state).toBe("offline"); // never LIVE/DELAYED for a non-live session
  });

  it("GET /api/f1/sessions/:id reports lifecycle=live for a currently-live session, with honest offline freshness when there's no LiveEvent data yet", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${LIVE_SESSION_ID}` });
    const body = res.json();
    expect(body.session.lifecycle).toBe("live");
    expect(body.session.detailAvailable).toBe(false);
    expect(body.freshness.state).toBe("offline"); // live session, but genuinely no data — not fabricated as LIVE
  });

  it("GET /api/f1/sessions/:sessionId/timing joins real driver/team info and sorts by position", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/timing` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.timing).toHaveLength(2);
    expect(body.timing[0]).toMatchObject({
      position: 1,
      driver: { name: "Test Driver", shortName: "TST" },
      tyreCompound: "SOFT",
    });
    expect(body.timing[0].driver.team).toMatchObject({ name: "Test Racing", colorHex: "#112233" });
  });

  it("GET /api/f1/sessions/:sessionId/timing degrades gracefully for a driver with no bootstrapped Player row", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/timing` });
    const body = res.json();
    const unknown = body.timing.find((t: { position: number }) => t.position === 2);
    expect(unknown.driver).toEqual({
      id: UNKNOWN_DRIVER_ID,
      name: UNKNOWN_DRIVER_ID,
      shortName: null,
      avatarUrl: null,
      team: null,
    });
  });

  it("GET /api/f1/sessions/:sessionId/race-control returns real seeded messages, never invented ones", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/race-control` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.messages).toEqual([
      {
        id: "api-test-rc-1",
        timestamp: "2020-01-01T00:30:00.000Z",
        category: "safety_car",
        message: "SAFETY CAR DEPLOYED",
      },
    ]);
  });

  it("GET /api/f1/sessions/:sessionId/pit-stops returns real seeded stops with driver info joined", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/pit-stops` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pitStops).toHaveLength(1);
    expect(body.pitStops[0]).toMatchObject({ lap: 12, durationMs: 23500, driver: { name: "Test Driver" } });
  });

  it("GET /api/f1/sessions/:sessionId/results returns normalized classifications with driver info", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/results` });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toEqual([
      expect.objectContaining({
        position: 1,
        driver: expect.objectContaining({ name: "Test Driver", shortName: "TST" }),
        status: "classified",
        lapsCompleted: 44,
        points: 25,
        durationSeconds: 4930.2,
        phases: [
          { duration: null, gap: null },
          { duration: null, gap: null },
          { duration: null, gap: null },
        ],
      }),
    ]);
  });

  it("GET /api/f1/sessions/:sessionId/laps returns normalized lap telemetry and validates limits", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/laps?limit=10` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      truncated: false,
      laps: [
        {
          id: "api-test-lap-1",
          driver: expect.objectContaining({ name: "Test Driver" }),
          lapNumber: 5,
          duration: 87.5,
          speedTrap: 310,
          isPitOutLap: false,
        },
      ],
    });
    expect((await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/laps?limit=0` })).statusCode).toBe(
      400,
    );
  });

  it("GET /api/f1/sessions/:sessionId/stints returns tyre strategy boundaries", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/sessions/${SESSION_ID}/stints` });
    expect(res.statusCode).toBe(200);
    expect(res.json().stints).toEqual([
      expect.objectContaining({
        driver: expect.objectContaining({ name: "Test Driver" }),
        stintNumber: 1,
        lapStart: 1,
        lapEnd: 20,
        compound: "SOFT",
        tyreAgeAtStart: 0,
      }),
    ]);
  });

  it("session detail and analysis endpoints all 404 for an unknown session", async () => {
    for (const path of ["timing", "race-control", "pit-stops", "results", "laps", "stints"]) {
      const res = await app.inject({ method: "GET", url: `/api/f1/sessions/does-not-exist/${path}` });
      expect(res.statusCode).toBe(404);
    }
  });

  it("GET /api/f1/seasons/:year/standings/drivers returns real driver standings, sorted by position, with driver/team joined and no fabricated movement field", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/seasons/${STANDINGS_SEASON_LABEL}/standings/drivers` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.season).toEqual({ year: STANDINGS_SEASON_LABEL, id: STANDINGS_SEASON_ID });
    expect(body.standings).toHaveLength(2);
    expect(body.standings[0]).toEqual({
      position: 1,
      points: 150,
      wins: 4,
      driver: { id: STANDINGS_DRIVER_ID, name: "Standings Test Driver", shortName: "STD", avatarUrl: null },
      team: { id: STANDINGS_TEAM_ID, name: "Standings Test Racing", colorHex: "#445566" },
    });
    expect(body.standings.every((s: Record<string, unknown>) => !("movement" in s) && !("positionChange" in s))).toBe(
      true,
    );
  });

  it("GET /api/f1/seasons/:year/standings/drivers degrades gracefully for a standing with no bootstrapped Player row, and reports wins:null when extra has none", async () => {
    const res = await app.inject({ method: "GET", url: `/api/f1/seasons/${STANDINGS_SEASON_LABEL}/standings/drivers` });
    const body = res.json();
    const unknown = body.standings.find((s: { position: number }) => s.position === 2);
    expect(unknown.driver).toEqual({
      id: STANDINGS_DRIVER_UNKNOWN_ID,
      name: STANDINGS_DRIVER_UNKNOWN_ID,
      shortName: null,
      avatarUrl: null,
    });
    expect(unknown.wins).toBeNull();
    expect(unknown.team).toBeNull();
  });

  it("GET /api/f1/seasons/:year/standings/constructors returns real constructor standings with team info joined", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/f1/seasons/${STANDINGS_SEASON_LABEL}/standings/constructors`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.standings).toEqual([
      {
        position: 1,
        points: 240,
        wins: 6,
        team: { id: STANDINGS_TEAM_ID, name: "Standings Test Racing", colorHex: "#445566" },
      },
    ]);
  });

  it("standings endpoints 404 for a season year that was never bootstrapped, rather than returning an empty list", async () => {
    for (const kind of ["drivers", "constructors"]) {
      const res = await app.inject({ method: "GET", url: `/api/f1/seasons/1899/standings/${kind}` });
      expect(res.statusCode).toBe(404);
    }
  });

  it("standings responses never leak a raw Jolpica constructorId or other provider-specific field", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/f1/seasons/${STANDINGS_SEASON_LABEL}/standings/constructors`,
    });
    const text = res.body;
    expect(text).not.toContain("jolpicaConstructorId");
    expect(text).not.toContain("constructorId");
  });
});
