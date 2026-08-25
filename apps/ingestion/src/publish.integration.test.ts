import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { prisma } from "@sports/db";
import type { LiveEvent } from "@sports/domain";
import { publishLiveEvent } from "./publish";

/**
 * Integration tests — real local Postgres, including the actual LISTEN/
 * NOTIFY channel apps/api's LiveEventBus uses. `LiveEvent.sessionId` is a
 * real foreign key (unlike DriverTiming/PitStop/RaceControlMessage — see
 * schema.prisma's comments on those), so a full Sport -> Competition ->
 * Season -> Fixture -> Session chain has to exist first.
 */
const SPORT_SLUG = "test-publish-sport";
const SESSION_ID = "publish-test-session";

function event(id: string): LiveEvent {
  return {
    id,
    sportId: SPORT_SLUG,
    sessionId: SESSION_ID,
    eventType: "SYNTHETIC_TICK",
    timestamp: "2026-01-01T00:00:00Z",
    source: "test",
    payload: { counter: 1 },
  };
}

describe("publishLiveEvent (integration, real Postgres)", () => {
  beforeAll(async () => {
    const sport = await prisma.sport.upsert({
      where: { slug: SPORT_SLUG },
      update: {},
      create: { slug: SPORT_SLUG, name: "Test Publish Sport", status: "beta" },
    });
    const competition = await prisma.competition.upsert({
      where: { id: "publish-test-competition" },
      update: {},
      create: {
        id: "publish-test-competition",
        sportId: sport.id,
        slug: "publish-test-competition",
        name: "Test",
        type: "championship",
      },
    });
    const season = await prisma.season.upsert({
      where: { id: "publish-test-season" },
      update: {},
      create: {
        id: "publish-test-season",
        competitionId: competition.id,
        label: "2099",
        startDate: new Date("2099-01-01"),
        endDate: new Date("2099-12-31"),
      },
    });
    const fixture = await prisma.fixture.upsert({
      where: { id: "publish-test-fixture" },
      update: {},
      create: {
        id: "publish-test-fixture",
        sportId: sport.id,
        competitionId: competition.id,
        seasonId: season.id,
        slug: "publish-test-fixture",
        name: "Test Fixture",
        status: "live",
        startTime: new Date("2099-01-01"),
      },
    });
    await prisma.session.upsert({
      where: { id: SESSION_ID },
      update: {},
      create: {
        id: SESSION_ID,
        fixtureId: fixture.id,
        type: "RACE",
        status: "live",
        startTime: new Date("2099-01-01"),
      },
    });
  });

  afterAll(async () => {
    const sport = await prisma.sport.findUniqueOrThrow({ where: { slug: SPORT_SLUG } });
    await prisma.liveEvent.deleteMany({ where: { sportId: sport.id } });
    await prisma.session.deleteMany({ where: { id: SESSION_ID } });
    await prisma.fixture.deleteMany({ where: { id: "publish-test-fixture" } });
    await prisma.season.deleteMany({ where: { id: "publish-test-season" } });
    await prisma.competition.deleteMany({ where: { id: "publish-test-competition" } });
    await prisma.sport.deleteMany({ where: { slug: SPORT_SLUG } });
  });

  it("reports created: true on first insert", async () => {
    const result = await publishLiveEvent(event("publish-test-1"));
    expect(result).toEqual({ created: true, sequence: expect.stringMatching(/^[1-9]\d*$/) });
  });

  it("reports created: false and does not duplicate the row on a repeat of the same event id", async () => {
    await publishLiveEvent(event("publish-test-2"));
    const result = await publishLiveEvent(event("publish-test-2"));
    expect(result).toEqual({ created: false });

    const rows = await prisma.liveEvent.findMany({ where: { id: "publish-test-2" } });
    expect(rows).toHaveLength(1);
  });

  it("notifies the live_events channel on a genuine new event, preserving the Phase 0 LISTEN/NOTIFY -> SSE pipeline", async () => {
    // `live_events` is one global Postgres channel, shared by every
    // ingestion test file that publishes (job.test.ts, this file, ...) —
    // real infrastructure, not a test-only detail (apps/api's LiveEventBus
    // listens on the exact same channel). Vitest runs test files
    // concurrently, so this listener can genuinely observe *other* files'
    // notifications arriving around the same time — filtering to this
    // test's own event id is what makes the assertion robust to that,
    // rather than assuming exclusive use of shared infrastructure.
    const listener = new Client({ connectionString: process.env.DATABASE_URL });
    await listener.connect();
    await listener.query("LISTEN live_events");

    const received: string[] = [];
    listener.on("notification", (msg) => {
      if (msg.payload) received.push(msg.payload);
    });

    await publishLiveEvent(event("publish-test-3"));
    await new Promise((resolve) => setTimeout(resolve, 200)); // let the notification arrive

    const own = received.filter((payload) => JSON.parse(payload).id === "publish-test-3");
    expect(own).toHaveLength(1);
    expect(JSON.parse(own[0])).toMatchObject({ id: "publish-test-3", eventType: "SYNTHETIC_TICK" });

    await listener.end();
  });

  it("does NOT re-notify when the same event is published a second time", async () => {
    await publishLiveEvent(event("publish-test-4"));

    const listener = new Client({ connectionString: process.env.DATABASE_URL });
    await listener.connect();
    await listener.query("LISTEN live_events");
    const received: string[] = [];
    listener.on("notification", (msg) => {
      if (msg.payload) received.push(msg.payload);
    });

    await publishLiveEvent(event("publish-test-4")); // duplicate — should not notify
    await new Promise((resolve) => setTimeout(resolve, 200));

    const own = received.filter((payload) => JSON.parse(payload).id === "publish-test-4");
    expect(own).toHaveLength(0);

    await listener.end();
  });
});
