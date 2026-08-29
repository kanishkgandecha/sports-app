import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { OpenF1HistoricalSessionAnalysis } from "@sports/providers-f1-openf1";
import { ANALYSIS_CURSOR_PROVIDER, importF1Analysis, type F1AnalysisProvider } from "./importF1Analysis";

const FIXTURE_ID = "f1-analysis-test-fixture";
const SESSION_ID = "f1-analysis-test-session";
const COMPETITION_ID = "f1-analysis-test-competition";
const SEASON_ID = "f1-analysis-test-season";
const DRIVER_ID = "f1-analysis-test-driver";

function analysis(lapNumber = 1): OpenF1HistoricalSessionAnalysis {
  return {
    classifications: [
      {
        id: "f1-analysis-test-result",
        sessionId: SESSION_ID,
        driverId: DRIVER_ID,
        position: 1,
        status: "classified",
        lapsCompleted: lapNumber,
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
        id: `f1-analysis-test-lap-${lapNumber}`,
        sessionId: SESSION_ID,
        driverId: DRIVER_ID,
        lapNumber,
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
        id: "f1-analysis-test-stint",
        sessionId: SESSION_ID,
        driverId: DRIVER_ID,
        stintNumber: 1,
        lapStart: lapNumber,
        lapEnd: lapNumber,
        compound: "SOFT",
        tyreAgeAtStart: 0,
      },
    ],
  };
}

async function resetAnalysisState() {
  await prisma.historicalImport.deleteMany({
    where: { source: "openf1-analysis", scopeKey: { contains: FIXTURE_ID } },
  });
  await prisma.providerCursor.deleteMany({ where: { providerId: ANALYSIS_CURSOR_PROVIDER, sessionId: SESSION_ID } });
  await prisma.sessionClassification.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.lap.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.tyreStint.deleteMany({ where: { sessionId: SESSION_ID } });
}

async function cleanup() {
  await resetAnalysisState();
  await prisma.session.deleteMany({ where: { id: SESSION_ID } });
  await prisma.fixture.deleteMany({ where: { id: FIXTURE_ID } });
  await prisma.season.deleteMany({ where: { id: SEASON_ID } });
  await prisma.competition.deleteMany({ where: { id: COMPETITION_ID } });
}

describe("F1 historical analysis persistence (real Postgres)", () => {
  beforeAll(async () => {
    await cleanup();
    const sport = await prisma.sport.upsert({
      where: { slug: "f1" },
      update: {},
      create: { slug: "f1", name: "Formula 1", status: "beta" },
    });
    await prisma.competition.create({
      data: {
        id: COMPETITION_ID,
        sportId: sport.id,
        slug: COMPETITION_ID,
        name: "Analysis Test",
        type: "championship",
      },
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
        name: "Analysis Test Grand Prix",
        status: "completed",
        startTime: new Date("2024-01-01"),
        dataProfile: {
          create: { source: "openf1", externalId: FIXTURE_ID, coverage: "event-data", datePrecision: "instant" },
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
        dataProfile: {
          create: {
            source: "openf1",
            status: "available",
            attemptCount: 7,
            importedAt: new Date("2024-01-02T00:00:00Z"),
          },
        },
      },
    });
  });
  beforeEach(resetAnalysisState);
  afterAll(cleanup);

  it("persists once and resumes by its independent cursor without touching detail availability", async () => {
    let calls = 0;
    const provider: F1AnalysisProvider = {
      id: "openf1",
      getHistoricalSessionAnalysis: async () => {
        calls += 1;
        return analysis();
      },
    };

    const first = await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID });
    const second = await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID });

    expect(first).toMatchObject({ matched: 1, imported: 1, skipped: 0, failed: 0 });
    expect(second).toMatchObject({ matched: 1, imported: 0, skipped: 1, failed: 0 });
    expect(calls).toBe(1);
    await expect(prisma.sessionClassification.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.lap.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.tyreStint.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(
      prisma.sessionDataProfile.findUniqueOrThrow({ where: { sessionId: SESSION_ID } }),
    ).resolves.toMatchObject({
      status: "available",
      attemptCount: 7,
    });
  });

  it("force refresh replaces the normalized snapshot atomically instead of duplicating rows", async () => {
    let lapNumber = 1;
    const provider: F1AnalysisProvider = {
      id: "openf1",
      getHistoricalSessionAnalysis: async () => analysis(lapNumber),
    };

    await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID });
    lapNumber = 2;
    const refresh = await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID, force: true });

    expect(refresh).toMatchObject({ imported: 1, failed: 0 });
    await expect(
      prisma.lap.findMany({ where: { sessionId: SESSION_ID }, select: { lapNumber: true } }),
    ).resolves.toEqual([{ lapNumber: 2 }]);
    await expect(prisma.sessionClassification.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
    await expect(prisma.tyreStint.count({ where: { sessionId: SESSION_ID } })).resolves.toBe(1);
  });

  it("retries an uncursored transient failure without downgrading the existing detail profile", async () => {
    let calls = 0;
    const provider: F1AnalysisProvider = {
      id: "openf1",
      getHistoricalSessionAnalysis: async () => {
        calls += 1;
        if (calls === 1) throw new Error("temporary analysis failure");
        return analysis();
      },
    };

    const failed = await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID });
    const recovered = await importF1Analysis(provider, { year: 2024, limit: 1, fixtureId: FIXTURE_ID });

    expect(failed).toMatchObject({ imported: 0, failed: 1 });
    expect(recovered).toMatchObject({ imported: 1, failed: 0 });
    expect(calls).toBe(2);
    await expect(
      prisma.sessionDataProfile.findUniqueOrThrow({ where: { sessionId: SESSION_ID } }),
    ).resolves.toMatchObject({
      status: "available",
      attemptCount: 7,
    });
  });
});
