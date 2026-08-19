import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@sports/db";
import { buildApp } from "../app";

/**
 * Integration tests — real local Postgres, a real Fastify app via
 * `app.inject()` — same pattern as `f1.test.ts`. Seeds a small, realistic
 * Cricket fixture/session/innings-state/scorecard/event dataset with
 * deterministic test-only ids, cleaned up after.
 */
const SPORT_SLUG = "cricket";
const FIXTURE_ID = "api-cricket-test-fixture";
const SESSION_ID = "api-cricket-test-session";
const SESSION_NO_STATE_ID = "api-cricket-test-session-no-state";
const LIVE_SESSION_ID = "api-cricket-test-session-live";
const TEAM_A_ID = "api-cricket-test-team-a";
const TEAM_B_ID = "api-cricket-test-team-b";
const STRIKER_ID = "api-cricket-test-player-striker";
const NON_STRIKER_ID = "api-cricket-test-player-nonstriker";
const BOWLER_ID = "api-cricket-test-player-bowler";
const UNKNOWN_PLAYER_ID = "api-cricket-test-player-unbootstrapped";

let app: FastifyInstance;

async function seed() {
  const sport = await prisma.sport.upsert({
    where: { slug: SPORT_SLUG },
    update: {},
    create: { slug: SPORT_SLUG, name: "Cricket", status: "beta" },
  });
  const competition = await prisma.competition.upsert({
    where: { id: "api-cricket-test-competition" },
    update: {},
    create: { id: "api-cricket-test-competition", sportId: sport.id, slug: "api-cricket-test-competition", name: "Test Series 2099", type: "tournament" },
  });
  const season = await prisma.season.upsert({
    where: { id: "api-cricket-test-season" },
    update: {},
    create: { id: "api-cricket-test-season", competitionId: competition.id, label: "2099", startDate: new Date("2099-01-01"), endDate: new Date("2099-12-31") },
  });
  const venue = await prisma.venue.upsert({
    where: { id: "api-cricket-test-venue" },
    update: {},
    create: { id: "api-cricket-test-venue", name: "Test Ground, Test City", country: null, timezone: "UTC" },
  });
  await prisma.fixture.upsert({
    where: { id: FIXTURE_ID },
    update: {},
    create: {
      id: FIXTURE_ID,
      sportId: sport.id,
      competitionId: competition.id,
      seasonId: season.id,
      slug: "api-cricket-test-match-2099",
      name: "Test Team A vs Test Team B",
      status: "live",
      startTime: new Date("2099-01-01T09:00:00Z"),
      venueId: venue.id,
    },
  });
  // A completed innings — used for scorecard/events assertions.
  await prisma.session.upsert({
    where: { id: SESSION_ID },
    update: {},
    create: { id: SESSION_ID, fixtureId: FIXTURE_ID, type: "1ST_INNINGS", status: "completed", startTime: new Date("2020-01-01T00:00:00Z"), endTime: new Date("2020-01-01T04:00:00Z") },
  });
  // A currently-live innings with no CricketInningsState yet (ingestion hasn't refreshed it) — used for honest-null assertions.
  await prisma.session.upsert({
    where: { id: LIVE_SESSION_ID },
    update: {},
    create: { id: LIVE_SESSION_ID, fixtureId: FIXTURE_ID, type: "2ND_INNINGS", status: "live", startTime: new Date(Date.now() - 30 * 60 * 1000), endTime: null },
  });
  await prisma.session.upsert({
    where: { id: SESSION_NO_STATE_ID },
    update: {},
    create: { id: SESSION_NO_STATE_ID, fixtureId: FIXTURE_ID, type: "3RD_INNINGS", status: "scheduled", startTime: new Date("2099-06-01T00:00:00Z"), endTime: null },
  });

  await prisma.team.upsert({ where: { id: TEAM_A_ID }, update: {}, create: { id: TEAM_A_ID, sportId: sport.id, name: "Test Team A", slug: "api-cricket-test-team-a", country: null, colorHex: null } });
  await prisma.team.upsert({ where: { id: TEAM_B_ID }, update: {}, create: { id: TEAM_B_ID, sportId: sport.id, name: "Test Team B", slug: "api-cricket-test-team-b", country: null, colorHex: null } });
  await prisma.player.upsert({ where: { id: STRIKER_ID }, update: {}, create: { id: STRIKER_ID, sportId: sport.id, teamId: TEAM_A_ID, name: "Striker Player", role: null, shortName: null, avatarUrl: null } });
  await prisma.player.upsert({ where: { id: NON_STRIKER_ID }, update: {}, create: { id: NON_STRIKER_ID, sportId: sport.id, teamId: TEAM_A_ID, name: "Non-Striker Player", role: null, shortName: null, avatarUrl: null } });
  await prisma.player.upsert({ where: { id: BOWLER_ID }, update: {}, create: { id: BOWLER_ID, sportId: sport.id, teamId: TEAM_B_ID, name: "Bowler Player", role: null, shortName: null, avatarUrl: null } });

  await prisma.cricketFixtureDetail.upsert({
    where: { fixtureId: FIXTURE_ID },
    update: {},
    create: { fixtureId: FIXTURE_ID, format: "T20", tossWonByTeamId: TEAM_A_ID, tossDecision: "BAT", result: null },
  });

  await prisma.cricketInningsState.upsert({
    where: { sessionId: SESSION_ID },
    update: {},
    create: {
      sessionId: SESSION_ID,
      battingTeamId: TEAM_A_ID,
      bowlingTeamId: TEAM_B_ID,
      runs: 167,
      wickets: 6,
      overs: 20,
      strikerId: STRIKER_ID,
      nonStrikerId: NON_STRIKER_ID,
      currentBowlerId: BOWLER_ID,
      target: null,
      requiredRunRate: null,
    },
  });

  await prisma.cricketBattingFigure.upsert({
    where: { sessionId_playerId: { sessionId: SESSION_ID, playerId: STRIKER_ID } },
    update: {},
    create: { sessionId: SESSION_ID, playerId: STRIKER_ID, battingOrder: 0, runs: 57, balls: 44, fours: 4, sixes: 2, strikeRate: 129.55, dismissalText: "not out" },
  });
  // A batting row for a player with no bootstrapped Player row — tests the "unknown player" fallback.
  await prisma.cricketBattingFigure.upsert({
    where: { sessionId_playerId: { sessionId: SESSION_ID, playerId: UNKNOWN_PLAYER_ID } },
    update: {},
    create: { sessionId: SESSION_ID, playerId: UNKNOWN_PLAYER_ID, battingOrder: 1, runs: 12, balls: 10, fours: 1, sixes: 0, strikeRate: 120, dismissalText: "b Bowler Player" },
  });
  await prisma.cricketBowlingFigure.upsert({
    where: { sessionId_playerId: { sessionId: SESSION_ID, playerId: BOWLER_ID } },
    update: {},
    create: { sessionId: SESSION_ID, playerId: BOWLER_ID, bowlingOrder: 0, overs: 4, maidens: 0, runsConceded: 28, wickets: 2, economy: 7 },
  });

  await prisma.liveEvent.upsert({
    where: { id: "api-cricket-test-event-1" },
    update: {},
    create: {
      id: "api-cricket-test-event-1",
      sportId: sport.id,
      sessionId: SESSION_ID,
      eventType: "WICKET",
      timestamp: new Date("2020-01-01T02:00:00Z"),
      source: "cricketdata",
      payload: { wickets: 6, overs: 18.4, dismissalText: "b Bowler Player" },
    },
  });
}

async function cleanup() {
  await prisma.liveEvent.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID, SESSION_NO_STATE_ID] } } });
  await prisma.cricketBattingFigure.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.cricketBowlingFigure.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.cricketInningsState.deleteMany({ where: { sessionId: { in: [SESSION_ID, LIVE_SESSION_ID, SESSION_NO_STATE_ID] } } });
  await prisma.cricketFixtureDetail.deleteMany({ where: { fixtureId: FIXTURE_ID } });
  await prisma.session.deleteMany({ where: { id: { in: [SESSION_ID, LIVE_SESSION_ID, SESSION_NO_STATE_ID] } } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.player.deleteMany({ where: { id: { in: [STRIKER_ID, NON_STRIKER_ID, BOWLER_ID] } } });
  await prisma.team.deleteMany({ where: { id: { in: [TEAM_A_ID, TEAM_B_ID] } } });
  await prisma.season.deleteMany({ where: { id: "api-cricket-test-season" } });
  await prisma.competition.deleteMany({ where: { id: "api-cricket-test-competition" } });
}

describe("Cricket routes (integration, real Postgres)", () => {
  beforeAll(async () => {
    await cleanup();
    await seed();
    app = await buildApp(process.env.DATABASE_URL!);
  });
  afterAll(async () => {
    await app.close();
    await cleanup();
  });

  it("GET /api/cricket/fixtures includes the seeded fixture with its venue and competition", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cricket/fixtures" });
    expect(res.statusCode).toBe(200);
    const fixture = res.json().fixtures.find((f: { id: string }) => f.id === FIXTURE_ID);
    expect(fixture).toBeDefined();
    expect(fixture.venue).toMatchObject({ name: "Test Ground, Test City", country: null });
    expect(fixture.competition).toMatchObject({ name: "Test Series 2099", type: "tournament" });
  });

  it("GET /api/cricket/fixtures/:id returns the fixture with sessions and real toss/format detail", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/fixtures/${FIXTURE_ID}` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fixture.id).toBe(FIXTURE_ID);
    expect(body.fixture.competition).toMatchObject({ name: "Test Series 2099" });
    expect(body.sessions.map((s: { id: string }) => s.id)).toEqual([SESSION_ID, LIVE_SESSION_ID, SESSION_NO_STATE_ID]);
    expect(body.detail).toMatchObject({ format: "T20", tossDecision: "BAT" });
    expect(body.detail.tossWonByTeam.name).toBe("Test Team A");
  });

  it("GET /api/cricket/fixtures/:id 404s for an unknown fixture", async () => {
    const res = await app.inject({ method: "GET", url: "/api/cricket/fixtures/does-not-exist" });
    expect(res.statusCode).toBe(404);
  });

  it("GET /api/cricket/sessions/:id reports lifecycle=completed and freshness=offline for a finished innings", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${SESSION_ID}` });
    const body = res.json();
    expect(body.session.lifecycle).toBe("completed");
    expect(body.freshness.state).toBe("offline");
  });

  it("GET /api/cricket/sessions/:id/innings returns real current state with real batsmen/bowler names joined", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${SESSION_ID}/innings` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.innings.runs).toBe(167);
    expect(body.innings.wickets).toBe(6);
    expect(body.innings.battingTeam.name).toBe("Test Team A");
    expect(body.innings.notOutBatsmen.map((p: { name: string }) => p.name).sort()).toEqual(["Non-Striker Player", "Striker Player"]);
    expect(body.innings.currentBowler.name).toBe("Bowler Player");
  });

  it("GET /api/cricket/sessions/:id/innings honestly returns innings:null when ingestion hasn't refreshed this session yet — never a fabricated zero state", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${LIVE_SESSION_ID}/innings` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.innings).toBeNull();
  });

  it("GET /api/cricket/sessions/:id/scorecard returns real batting/bowling figures with names joined", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${SESSION_ID}/scorecard` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.scorecard.batting).toHaveLength(2);
    expect(body.scorecard.batting[0]).toMatchObject({ player: { name: "Striker Player" }, runs: 57, dismissalText: "not out" });
    expect(body.scorecard.bowling[0]).toMatchObject({ player: { name: "Bowler Player" }, wickets: 2, economy: 7 });
  });

  it("GET /api/cricket/sessions/:id/scorecard degrades gracefully for a batting row with no bootstrapped Player row", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${SESSION_ID}/scorecard` });
    const body = res.json();
    const unknown = body.scorecard.batting.find((b: { player: { id: string } }) => b.player.id === UNKNOWN_PLAYER_ID);
    expect(unknown.player).toEqual({ id: UNKNOWN_PLAYER_ID, name: UNKNOWN_PLAYER_ID, shortName: null, avatarUrl: null });
  });

  it("GET /api/cricket/sessions/:id/scorecard honestly returns scorecard:null when no scorecard was ever captured", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${LIVE_SESSION_ID}/scorecard` });
    expect(res.json().scorecard).toBeNull();
  });

  it("GET /api/cricket/sessions/:id/events returns real, normalized LiveEvents, no raw provider fields", async () => {
    const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/${SESSION_ID}/events` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({ id: "api-cricket-test-event-1", eventType: "WICKET" });
    expect(JSON.stringify(body.events[0])).not.toMatch(/cricapi|match_bbb|bbbEnabled/i);
  });

  it("sessions/innings/scorecard/events all 404 for an unknown session", async () => {
    for (const path of ["", "/innings", "/scorecard", "/events"]) {
      const res = await app.inject({ method: "GET", url: `/api/cricket/sessions/does-not-exist${path}` });
      expect(res.statusCode).toBe(404);
    }
  });

  it("never leaks a raw CricketData.org field name anywhere in a Cricket response body", async () => {
    for (const url of [
      "/api/cricket/fixtures",
      `/api/cricket/fixtures/${FIXTURE_ID}`,
      `/api/cricket/sessions/${SESSION_ID}/innings`,
      `/api/cricket/sessions/${SESSION_ID}/scorecard`,
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.body).not.toMatch(/dateTimeGMT|matchStarted|matchEnded|tossChoice|cricbuzz_id/);
    }
  });
});
