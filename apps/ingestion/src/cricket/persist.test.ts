import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { cricket } from "@sports/domain";
import { upsertCricketFixtureDetail, upsertCricketInningsState } from "./persist";

const FIXTURE_ID = "cricket-persist-test-fixture";
const SESSION_ID = "cricket-persist-test-session";

async function cleanup() {
  await prisma.cricketFixtureDetail.deleteMany({ where: { fixtureId: FIXTURE_ID } });
  await prisma.cricketInningsState.deleteMany({ where: { sessionId: SESSION_ID } });
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
