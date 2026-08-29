import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { prisma } from "@sports/db";
import type { OpenF1HistoricalSessionDetail } from "@sports/providers-f1-openf1";
import { importF1Details, selectCompletedDetailSessions, type F1DetailProvider } from "./importF1Details";

const FIXTURE_ID = "f1-detail-test-fixture";
const SESSION_ID = "f1-detail-test-session";
const EVENT_ID = "f1-detail-test-event";
const TEAM_ID = "f1-detail-test-team";
const PLAYER_ID = "f1-detail-test-player";
const COMPETITION_ID = "f1-detail-test-competition";
const SEASON_ID = "f1-detail-test-season";

function detail(): OpenF1HistoricalSessionDetail {
  return {
    teams: [
      {
        id: TEAM_ID,
        sportId: "f1",
        name: "Detail Test Racing",
        slug: TEAM_ID,
        country: null,
        colorHex: "#123456",
      },
    ],
    players: [
      {
        id: PLAYER_ID,
        sportId: "f1",
        teamId: TEAM_ID,
        name: "Detail Test Driver",
        role: "driver",
        shortName: "DTD",
        avatarUrl: null,
      },
    ],
    events: [
      {
        id: EVENT_ID,
        sportId: "f1",
        sessionId: SESSION_ID,
        eventType: "LAP_COMPLETED",
        timestamp: "2024-01-01T01:00:00.000Z",
        source: "openf1",
        payload: { driverId: PLAYER_ID, lap: 1, lapTime: "90.000" },
      },
    ],
    timingPatches: [
      {
        sessionId: SESSION_ID,
        driverId: PLAYER_ID,
        position: 1,
        gapToLeader: "0.000",
        bestLapTime: 90,
        state: "running",
      },
    ],
    classifications: [
      {
        id: "f1-detail-test-result",
        sessionId: SESSION_ID,
        driverId: PLAYER_ID,
        position: 1,
        status: "classified",
        lapsCompleted: 1,
        points: 25,
        durationSeconds: 90,
        gapToLeader: "0.000",
        phase1Duration: null,
        phase2Duration: null,
        phase3Duration: null,
        phase1Gap: null,
        phase2Gap: null,
        phase3Gap: null,
      },
    ],
    laps: [
      {
        id: "f1-detail-test-lap",
        sessionId: SESSION_ID,
        driverId: PLAYER_ID,
        lapNumber: 1,
        startedAt: "2024-01-01T01:00:00.000Z",
        duration: 90,
        sector1: 30,
        sector2: 30,
        sector3: 30,
        speedI1: 250,
        speedI2: 270,
        speedTrap: 300,
        isPitOutLap: false,
      },
    ],
    stints: [
      {
        id: "f1-detail-test-stint",
        sessionId: SESSION_ID,
        driverId: PLAYER_ID,
        stintNumber: 1,
        lapStart: 1,
        lapEnd: 1,
        compound: "SOFT",
        tyreAgeAtStart: 0,
      },
    ],
  };
}

async function cleanup() {
  await prisma.historicalImport.deleteMany({ where: { source: "openf1-detail", scopeKey: { contains: FIXTURE_ID } } });
  await prisma.providerCursor.deleteMany({ where: { providerId: "openf1-history-detail-v1", sessionId: SESSION_ID } });
  await prisma.liveEvent.deleteMany({ where: { id: EVENT_ID } });
  await prisma.sessionClassification.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.lap.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.tyreStint.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.driverTiming.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.session.deleteMany({ where: { id: SESSION_ID } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.player.deleteMany({ where: { id: PLAYER_ID } });
  await prisma.team.deleteMany({ where: { id: TEAM_ID } });
  await prisma.season.deleteMany({ where: { id: SEASON_ID } });
  await prisma.competition.deleteMany({ where: { id: COMPETITION_ID } });
}

describe("F1 historical detail selection", () => {
  it("selects only completed requested session types", () => {
    const now = new Date("2024-01-02T00:00:00Z");
    const sessions = [
      { id: "race", fixtureId: "f", type: "RACE", status: "completed", endTime: new Date("2024-01-01") },
      { id: "fp1", fixtureId: "f", type: "FP1", status: "completed", endTime: new Date("2024-01-01") },
      { id: "future", fixtureId: "f", type: "RACE", status: "scheduled", endTime: new Date("2024-01-03") },
    ];
    expect(selectCompletedDetailSessions(sessions, ["RACE"], now).map((session) => session.id)).toEqual(["race"]);
    expect(selectCompletedDetailSessions(sessions, "ALL", now).map((session) => session.id)).toEqual(["race", "fp1"]);
  });
});

describe("F1 historical detail persistence (real Postgres)", () => {
  beforeAll(async () => {
    await cleanup();
    const sport = await prisma.sport.upsert({
      where: { slug: "f1" },
      update: {},
      create: { slug: "f1", name: "Formula 1", status: "beta" },
    });
    await prisma.competition.create({
      data: { id: COMPETITION_ID, sportId: sport.id, slug: COMPETITION_ID, name: "Detail Test", type: "championship" },
    });
    await prisma.season.create({
      data: {
        id: SEASON_ID,
        competitionId: COMPETITION_ID,
        label: "2024",
        startDate: new Date("2024-01-01"),
        endDate: new Date("2024-12-31"),
      },
    });
    await prisma.fixture.create({
      data: {
        id: FIXTURE_ID,
        sportId: sport.id,
        competitionId: COMPETITION_ID,
        seasonId: SEASON_ID,
        slug: FIXTURE_ID,
        name: "Detail Test Grand Prix",
        status: "completed",
        startTime: new Date("2024-01-01"),
        dataProfile: {
          create: { source: "openf1", externalId: FIXTURE_ID, coverage: "summary", datePrecision: "instant" },
        },
      },
    });
    await prisma.session.create({
      data: {
        id: SESSION_ID,
        fixtureId: FIXTURE_ID,
        type: "RACE",
        status: "completed",
        startTime: new Date("2024-01-01T00:00:00Z"),
        endTime: new Date("2024-01-01T02:00:00Z"),
      },
    });
  });
  afterAll(cleanup);

  it("persists once, upgrades coverage, resumes by cursor, and never notifies the live channel", async () => {
    let calls = 0;
    const provider: F1DetailProvider = {
      id: "openf1",
      getHistoricalSessionDetail: async () => {
        calls += 1;
        return detail();
      },
    };
    const listener = new Client({ connectionString: process.env.DATABASE_URL });
    await listener.connect();
    await listener.query("LISTEN live_events");
    const notifications: string[] = [];
    listener.on("notification", (message) => {
      if (message.payload) notifications.push(message.payload);
    });

    const first = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
    });
    const second = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(first).toMatchObject({ matched: 1, imported: 1, skipped: 0, failed: 0 });
    expect(second).toMatchObject({ matched: 1, imported: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(1);
    expect(notifications.filter((payload) => JSON.parse(payload).id === EVENT_ID)).toHaveLength(0);
    await expect(prisma.driverTiming.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.liveEvent.count({ where: { id: EVENT_ID } })).resolves.toBe(1);
    await expect(prisma.sessionClassification.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.lap.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.tyreStint.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(
      prisma.fixtureDataProfile.findUniqueOrThrow({ where: { fixtureId: FIXTURE_ID } }),
    ).resolves.toMatchObject({
      coverage: "event-data",
    });
    await listener.end();
  });

  it("persists a truthful terminal state when OpenF1 has no historical detail", async () => {
    await resetDetailState();
    let calls = 0;
    const provider: F1DetailProvider = {
      id: "openf1",
      getHistoricalSessionDetail: async () => {
        calls += 1;
        return { teams: [], players: [], events: [], timingPatches: [], classifications: [], laps: [], stints: [] };
      },
    };

    const first = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
    });
    const second = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
    });

    expect(first).toMatchObject({ matched: 1, imported: 0, skipped: 1, failed: 0, unavailable: 1 });
    expect(second).toMatchObject({ matched: 1, imported: 0, skipped: 1, failed: 0, unavailable: 1 });
    expect(calls).toBe(1);
    await expect(
      prisma.sessionDataProfile.findUniqueOrThrow({ where: { sessionId: SESSION_ID } }),
    ).resolves.toMatchObject({
      status: "upstream-unavailable",
      attemptCount: 1,
      nextRetryAt: null,
    });
    await expect(
      prisma.fixtureDataProfile.findUniqueOrThrow({ where: { fixtureId: FIXTURE_ID } }),
    ).resolves.toMatchObject({
      coverage: "summary",
    });
  });

  it("records transient failures with a future retry instead of claiming data is unavailable", async () => {
    await resetDetailState();
    let calls = 0;
    const provider: F1DetailProvider = {
      id: "openf1",
      getHistoricalSessionDetail: async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary upstream failure");
        return detail();
      },
    };

    const result = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
      now: new Date("2024-01-02T00:00:00Z"),
    });

    expect(result).toMatchObject({ matched: 1, imported: 0, skipped: 0, failed: 1 });
    await expect(
      prisma.sessionDataProfile.findUniqueOrThrow({ where: { sessionId: SESSION_ID } }),
    ).resolves.toMatchObject({
      status: "failed",
      reason: "temporary upstream failure",
      nextRetryAt: new Date("2024-01-02T06:00:00Z"),
    });

    const deferred = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
      now: new Date("2024-01-02T01:00:00Z"),
    });
    expect(deferred).toMatchObject({ imported: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(1);

    const forced = await importF1Details(provider, {
      year: 2024,
      limit: 1,
      fixtureId: FIXTURE_ID,
      sessionTypes: "ALL",
      retryFailed: true,
      now: new Date("2024-01-02T01:00:00Z"),
    });
    expect(forced).toMatchObject({ imported: 1, skipped: 0, failed: 0 });
    expect(calls).toBe(2);
    await expect(
      prisma.sessionDataProfile.findUniqueOrThrow({ where: { sessionId: SESSION_ID } }),
    ).resolves.toMatchObject({ status: "available", attemptCount: 2, nextRetryAt: null });
  });
});

async function resetDetailState() {
  await prisma.providerCursor.deleteMany({ where: { providerId: "openf1-history-detail-v1", sessionId: SESSION_ID } });
  await prisma.liveEvent.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.sessionClassification.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.lap.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.tyreStint.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.driverTiming.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.sessionDataProfile.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.fixtureDataProfile.update({ where: { fixtureId: FIXTURE_ID }, data: { coverage: "summary" } });
}
