import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@sports/db";
import { upsertDriverTiming, upsertPitStop, upsertRaceControlMessage } from "./persist";

/** Integration tests — real local Postgres, see bootstrapCalendar.test.ts's doc comment. */
const SESSION_ID = "f1-test-session-persist";

async function cleanup() {
  await prisma.raceControlMessage.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.pitStop.deleteMany({ where: { sessionId: SESSION_ID } });
  await prisma.driverTiming.deleteMany({ where: { sessionId: SESSION_ID } });
}

describe("upsertRaceControlMessage (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates a new row", async () => {
    await upsertRaceControlMessage({
      id: "rc-1",
      sessionId: SESSION_ID,
      timestamp: "2026-01-01T00:00:00Z",
      category: "red_flag",
      message: "RED FLAG",
    });
    const rows = await prisma.raceControlMessage.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("RED FLAG");
  });

  it("does not duplicate the same provider event processed twice", async () => {
    const row = { id: "rc-1", sessionId: SESSION_ID, timestamp: "2026-01-01T00:00:00Z", category: "red_flag" as const, message: "RED FLAG" };
    await upsertRaceControlMessage(row);
    await upsertRaceControlMessage(row);
    const rows = await prisma.raceControlMessage.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
  });
});

describe("upsertPitStop (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates a new row", async () => {
    await upsertPitStop({
      id: "pit-1",
      sessionId: SESSION_ID,
      driverId: "f1-driver-1",
      lap: 12,
      durationMs: 23500,
      timestamp: "2026-01-01T00:00:00Z",
    });
    const rows = await prisma.pitStop.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
  });

  it("does not duplicate the same pit stop processed twice", async () => {
    const row = { id: "pit-1", sessionId: SESSION_ID, driverId: "f1-driver-1", lap: 12, durationMs: 23500, timestamp: "2026-01-01T00:00:00Z" };
    await upsertPitStop(row);
    await upsertPitStop(row);
    const rows = await prisma.pitStop.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(1);
  });
});

describe("upsertDriverTiming (integration, real Postgres)", () => {
  beforeEach(cleanup);
  afterAll(cleanup);

  it("creates a row from a partial patch, defaulting position/state", async () => {
    await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-1", lastLapTime: 90.123 });
    const row = await prisma.driverTiming.findUniqueOrThrow({
      where: { sessionId_driverId: { sessionId: SESSION_ID, driverId: "f1-driver-1" } },
    });
    expect(row.lastLapTime).toBe(90.123);
    expect(row.position).toBe(0); // documented placeholder default
    expect(row.state).toBe("running");
  });

  it("merges a second partial patch into the same row rather than duplicating it", async () => {
    await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-1", position: 3 });
    await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-1", lastLapTime: 88.5 });

    const rows = await prisma.driverTiming.findMany({ where: { sessionId: SESSION_ID, driverId: "f1-driver-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(3); // preserved from the first patch
    expect(rows[0].lastLapTime).toBe(88.5); // added by the second patch
  });

  it("repeated identical updates don't create duplicate rows (idempotent current-state upsert)", async () => {
    for (let i = 0; i < 3; i++) {
      await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-1", position: 5 });
    }
    const rows = await prisma.driverTiming.findMany({ where: { sessionId: SESSION_ID, driverId: "f1-driver-1" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].position).toBe(5);
  });

  it("keeps separate drivers as separate rows", async () => {
    await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-1", position: 1 });
    await upsertDriverTiming({ sessionId: SESSION_ID, driverId: "f1-driver-2", position: 2 });
    const rows = await prisma.driverTiming.findMany({ where: { sessionId: SESSION_ID } });
    expect(rows).toHaveLength(2);
  });
});
