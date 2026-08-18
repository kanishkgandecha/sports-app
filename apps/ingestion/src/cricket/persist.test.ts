import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { cricket, Player, Team } from "@sports/domain";
import {
  upsertCricketBattingFigure,
  upsertCricketBowlingFigure,
  upsertCricketFixtureDetail,
  upsertCricketInningsState,
  upsertCricketRoster,
} from "./persist";

const FIXTURE_ID = "cricket-persist-test-fixture";
const SESSION_ID = "cricket-persist-test-session";
const SPORT_SLUG = "cricket-persist-test";
const TEAM_ID = "cricket-persist-test-team";
const PLAYER_ID = "cricket-persist-test-player";

async function cleanup() {
  await prisma.cricketFixtureDetail.deleteMany({ where: { fixtureId: FIXTURE_ID } });
  await prisma.cricketInningsState.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.cricketBattingFigure.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.cricketBowlingFigure.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.player.deleteMany({ where: { id: PLAYER_ID } });
  await prisma.team.deleteMany({ where: { id: TEAM_ID } });
}

describe("upsertCricketFixtureDetail (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates a real row on first write", async () => {
    const detail: cricket.CricketFixtureDetail = {
      id: "x",
      fixtureId: FIXTURE_ID,
      format: "T20",
      tossWonByTeamId: "cricket-team-a",
      tossDecision: "BOWL",
      result: null,
    };
    await upsertCricketFixtureDetail(detail);
    const row = await prisma.cricketFixtureDetail.findUniqueOrThrow({ where: { fixtureId: FIXTURE_ID } });
    expect(row).toMatchObject({ format: "T20", tossWonByTeamId: "cricket-team-a", tossDecision: "BOWL" });
  });

  it("is idempotent via the unique fixtureId constraint — upserting twice updates in place, no duplicate row", async () => {
    const detail: cricket.CricketFixtureDetail = { id: "x", fixtureId: FIXTURE_ID, format: "T20", tossWonByTeamId: null, tossDecision: null, result: null };
    await upsertCricketFixtureDetail(detail);
    await upsertCricketFixtureDetail({ ...detail, result: "Team A won by 5 wkts" });

    const rows = await prisma.cricketFixtureDetail.findMany({ where: { fixtureId: FIXTURE_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].result).toBe("Team A won by 5 wkts");
  });

  it("stores a null format honestly rather than a fabricated default", async () => {
    const detail: cricket.CricketFixtureDetail = { id: "x", fixtureId: FIXTURE_ID, format: null, tossWonByTeamId: null, tossDecision: null, result: null };
    await upsertCricketFixtureDetail(detail);
    const row = await prisma.cricketFixtureDetail.findUniqueOrThrow({ where: { fixtureId: FIXTURE_ID } });
    expect(row.format).toBeNull();
  });
});

describe("upsertCricketInningsState (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates a real row on first write", async () => {
    const state: cricket.CricketInningsState = {
      id: "x",
      sessionId: SESSION_ID,
      battingTeamId: "cricket-team-a",
      bowlingTeamId: "cricket-team-b",
      runs: 120,
      wickets: 3,
      overs: 14.2,
      strikerId: "cricket-player-1",
      nonStrikerId: "cricket-player-2",
      currentBowlerId: "cricket-player-3",
      target: null,
      requiredRunRate: null,
    };
    await upsertCricketInningsState(state);
    const row = await prisma.cricketInningsState.findUniqueOrThrow({ where: { sessionId: SESSION_ID } });
    expect(row).toMatchObject({ runs: 120, wickets: 3, overs: 14.2 });
  });

  it("is idempotent via the unique sessionId constraint — overwrites the current-state row in place", async () => {
    const state: cricket.CricketInningsState = {
      id: "x",
      sessionId: SESSION_ID,
      battingTeamId: "cricket-team-a",
      bowlingTeamId: "cricket-team-b",
      runs: 10,
      wickets: 0,
      overs: 2,
      strikerId: null,
      nonStrikerId: null,
      currentBowlerId: null,
      target: null,
      requiredRunRate: null,
    };
    await upsertCricketInningsState(state);
    await upsertCricketInningsState({ ...state, runs: 45, wickets: 2, overs: 6.3 });

    const rows = await prisma.cricketInningsState.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runs: 45, wickets: 2, overs: 6.3 });
  });

  it("stores a real target/requiredRunRate when present, null when not", async () => {
    const chasing: cricket.CricketInningsState = {
      id: "x",
      sessionId: SESSION_ID,
      battingTeamId: "cricket-team-b",
      bowlingTeamId: "cricket-team-a",
      runs: 100,
      wickets: 2,
      overs: 12,
      strikerId: null,
      nonStrikerId: null,
      currentBowlerId: null,
      target: 168,
      requiredRunRate: 8.5,
    };
    await upsertCricketInningsState(chasing);
    const row = await prisma.cricketInningsState.findUniqueOrThrow({ where: { sessionId: SESSION_ID } });
    expect(row.target).toBe(168);
    expect(row.requiredRunRate).toBe(8.5);
  });
});

describe("upsertCricketBattingFigure / upsertCricketBowlingFigure (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates real batting/bowling rows on first write", async () => {
    const batting: cricket.CricketBattingFigure = {
      id: "x",
      sessionId: SESSION_ID,
      playerId: PLAYER_ID,
      battingOrder: 0,
      runs: 57,
      balls: 44,
      fours: 4,
      sixes: 2,
      strikeRate: 129.55,
      dismissalText: "not out",
    };
    const bowling: cricket.CricketBowlingFigure = {
      id: "x",
      sessionId: SESSION_ID,
      playerId: PLAYER_ID,
      bowlingOrder: 0,
      overs: 2,
      maidens: 0,
      runsConceded: 7,
      wickets: 0,
      economy: 3.5,
    };
    await upsertCricketBattingFigure(batting);
    await upsertCricketBowlingFigure(bowling);

    const battingRow = await prisma.cricketBattingFigure.findUniqueOrThrow({ where: { sessionId_playerId: { sessionId: SESSION_ID, playerId: PLAYER_ID } } });
    expect(battingRow).toMatchObject({ runs: 57, balls: 44, dismissalText: "not out" });
    const bowlingRow = await prisma.cricketBowlingFigure.findUniqueOrThrow({ where: { sessionId_playerId: { sessionId: SESSION_ID, playerId: PLAYER_ID } } });
    expect(bowlingRow).toMatchObject({ overs: 2, economy: 3.5 });
  });

  it("is idempotent via @@unique([sessionId, playerId]) — overwrites in place, no duplicate row", async () => {
    const batting: cricket.CricketBattingFigure = { id: "x", sessionId: SESSION_ID, playerId: PLAYER_ID, battingOrder: 0, runs: 10, balls: 8, fours: 1, sixes: 0, strikeRate: 125, dismissalText: "not out" };
    await upsertCricketBattingFigure(batting);
    await upsertCricketBattingFigure({ ...batting, runs: 57, dismissalText: "b Agnes Qwele" });

    const rows = await prisma.cricketBattingFigure.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ runs: 57, dismissalText: "b Agnes Qwele" });
  });
});

describe("upsertCricketRoster (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates the Sport row (if missing), then real Team/Player rows", async () => {
    const teams: Team[] = [{ id: TEAM_ID, sportId: "cricket", name: "Test Team", slug: "test-team", country: null, colorHex: null }];
    const players: Player[] = [{ id: PLAYER_ID, sportId: "cricket", teamId: TEAM_ID, name: "Test Player", role: null, shortName: null, avatarUrl: null }];

    await upsertCricketRoster(SPORT_SLUG, teams, players);

    const team = await prisma.team.findUniqueOrThrow({ where: { id: TEAM_ID } });
    expect(team.name).toBe("Test Team");
    const player = await prisma.player.findUniqueOrThrow({ where: { id: PLAYER_ID } });
    expect(player.name).toBe("Test Player");
    expect(player.teamId).toBe(TEAM_ID);
  });

  it("resolves Team/Player.sportId to the real Sport row id, not the provider's sport slug — the same real bug class bootstrapCricketCurrent's own team upsert already had to avoid", async () => {
    const teams: Team[] = [{ id: TEAM_ID, sportId: "cricket", name: "Test Team", slug: "test-team", country: null, colorHex: null }];
    await upsertCricketRoster(SPORT_SLUG, teams, []);

    const sportRow = await prisma.sport.findUniqueOrThrow({ where: { slug: SPORT_SLUG } });
    const team = await prisma.team.findUniqueOrThrow({ where: { id: TEAM_ID } });
    expect(team.sportId).toBe(sportRow.id);
    expect(team.sportId).not.toBe("cricket");
  });

  it("is idempotent — upserting the same roster twice creates no duplicate rows", async () => {
    const teams: Team[] = [{ id: TEAM_ID, sportId: "cricket", name: "Test Team", slug: "test-team", country: null, colorHex: null }];
    await upsertCricketRoster(SPORT_SLUG, teams, []);
    await upsertCricketRoster(SPORT_SLUG, teams, []);
    const rows = await prisma.team.findMany({ where: { id: TEAM_ID } });
    expect(rows).toHaveLength(1);
  });
});
