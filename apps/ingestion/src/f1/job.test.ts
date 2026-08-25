import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import type { LiveEvent } from "@sports/domain";
import type { SportsProvider } from "@sports/providers-core";
import { pollActiveSessions } from "./job";

/**
 * Integration tests — real local Postgres (publishLiveEvent/persist.ts write
 * through it), but the *provider* is a controllable fake so timeout/
 * malformed-response/error scenarios are deterministic and offline w.r.t.
 * OpenF1 — exactly this checkpoint's requirement ("provider timeout",
 * "provider error", "malformed provider response", "one failed session
 * doesn't stop other sessions").
 */
const SPORT_SLUG = "f1-test-job";

class FaultyProvider implements SportsProvider {
  readonly id = "test-faulty";
  readonly sportId = SPORT_SLUG;

  async getCompetitions() {
    return [];
  }
  async getSeasons() {
    return [];
  }
  async getFixtures() {
    return [];
  }
  async getSessions() {
    return [];
  }
  async getTeams() {
    return [];
  }
  async getPlayers() {
    return [];
  }
  async getVenues() {
    return [];
  }
  async getStandings() {
    return [];
  }

  async pollLiveEvents(input: { sessionId: string }): Promise<LiveEvent[]> {
    if (input.sessionId === "bad-timeout") {
      const err = new Error("Request timed out after 10000ms");
      err.name = "OpenF1RequestError";
      throw err;
    }
    if (input.sessionId === "bad-malformed") {
      throw new Error("Malformed JSON from /race_control: Unexpected token");
    }
    if (input.sessionId === "good") {
      return [
        {
          id: "job-test-event-1",
          sportId: SPORT_SLUG,
          sessionId: "good",
          eventType: "SYNTHETIC_TICK",
          timestamp: "2026-01-01T00:00:00Z",
          source: "test-faulty",
          payload: { counter: 1 },
        },
      ];
    }
    return [];
  }
}

async function cleanup() {
  await prisma.providerCursor.deleteMany({ where: { providerId: "test-faulty" } });
  const sport = await prisma.sport.findUnique({ where: { slug: SPORT_SLUG } });
  if (sport) await prisma.liveEvent.deleteMany({ where: { sportId: sport.id } });
  await prisma.session.deleteMany({ where: { id: "good" } });
  await prisma.fixture.deleteMany({ where: { id: "job-test-fixture" } });
  await prisma.season.deleteMany({ where: { id: "job-test-season" } });
  await prisma.competition.deleteMany({ where: { id: "job-test-competition" } });
  await prisma.sport.deleteMany({ where: { slug: SPORT_SLUG } });
}

describe("pollActiveSessions — error isolation (integration, real Postgres)", () => {
  beforeAll(async () => {
    // `good` needs to be a real Session row — LiveEvent.sessionId is a real
    // FK (unlike DriverTiming/PitStop/RaceControlMessage). "bad-timeout"/
    // "bad-malformed" never reach publishLiveEvent (pollLiveEvents throws
    // first), so they need no DB row at all.
    const sport = await prisma.sport.upsert({
      where: { slug: SPORT_SLUG },
      update: {},
      create: { slug: SPORT_SLUG, name: "Test Job Sport", status: "beta" },
    });
    const competition = await prisma.competition.upsert({
      where: { id: "job-test-competition" },
      update: {},
      create: {
        id: "job-test-competition",
        sportId: sport.id,
        slug: "job-test-competition",
        name: "Test",
        type: "championship",
      },
    });
    const season = await prisma.season.upsert({
      where: { id: "job-test-season" },
      update: {},
      create: {
        id: "job-test-season",
        competitionId: competition.id,
        label: "2099",
        startDate: new Date("2099-01-01"),
        endDate: new Date("2099-12-31"),
      },
    });
    const fixture = await prisma.fixture.upsert({
      where: { id: "job-test-fixture" },
      update: {},
      create: {
        id: "job-test-fixture",
        sportId: sport.id,
        competitionId: competition.id,
        seasonId: season.id,
        slug: "job-test-fixture",
        name: "Test Fixture",
        status: "live",
        startTime: new Date("2099-01-01"),
      },
    });
    await prisma.session.upsert({
      where: { id: "good" },
      update: {},
      create: { id: "good", fixtureId: fixture.id, type: "RACE", status: "live", startTime: new Date("2099-01-01") },
    });
  });
  afterAll(cleanup);

  it("does not throw when every active session's poll fails (provider timeout + malformed response)", async () => {
    const provider = new FaultyProvider();
    await expect(
      pollActiveSessions(
        provider,
        [
          { sessionId: "bad-timeout", reason: "test" },
          { sessionId: "bad-malformed", reason: "test" },
        ],
        new Map(),
      ),
    ).resolves.toBeUndefined();
  });

  it("a failing session does not prevent a healthy session in the same tick from being processed", async () => {
    const provider = new FaultyProvider();
    await pollActiveSessions(
      provider,
      [
        { sessionId: "bad-timeout", reason: "test" },
        { sessionId: "good", reason: "test" },
        { sessionId: "bad-malformed", reason: "test" },
      ],
      new Map(),
    );

    const published = await prisma.liveEvent.findUnique({ where: { id: "job-test-event-1" } });
    expect(published).not.toBeNull();
    expect(published?.eventType).toBe("SYNTHETIC_TICK");
  });

  it("handles an empty active-session list without throwing", async () => {
    const provider = new FaultyProvider();
    await expect(pollActiveSessions(provider, [], new Map())).resolves.toBeUndefined();
  });

  it("advances the cursor only for sessions that succeeded, not ones that failed", async () => {
    const provider = new FaultyProvider();
    const cursors = new Map<string, string>();
    await pollActiveSessions(
      provider,
      [
        { sessionId: "bad-timeout", reason: "test" },
        { sessionId: "good", reason: "test" },
      ],
      cursors,
    );
    expect(cursors.has("bad-timeout")).toBe(false);
    expect(cursors.get("good")).toBe("2026-01-01T00:00:00Z");
  });
});
