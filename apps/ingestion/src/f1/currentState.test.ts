import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@sports/domain";
import { mergeDriverTimingPatches, toPitStopRow, toRaceControlMessageRow } from "./currentState";

function event(overrides: Partial<LiveEvent>): LiveEvent {
  return {
    id: "evt-1",
    sportId: "f1",
    sessionId: "f1-session-1",
    eventType: "SAFETY_CAR",
    timestamp: "2026-01-01T00:00:00Z",
    source: "openf1",
    payload: {},
    ...overrides,
  };
}

describe("toRaceControlMessageRow", () => {
  it("derives a row for a SAFETY_CAR event, preserving the original message text", () => {
    const e = event({
      eventType: "SAFETY_CAR",
      payload: { category: "red_flag", deployedLap: 8, message: "RED FLAG" },
    });
    expect(toRaceControlMessageRow(e)).toEqual({
      id: "evt-1",
      sessionId: "f1-session-1",
      timestamp: "2026-01-01T00:00:00Z",
      category: "red_flag",
      message: "RED FLAG",
    });
  });

  it("derives a row for a FLAG event with category normalized to 'flag'", () => {
    const e = event({
      eventType: "FLAG",
      payload: { flag: "YELLOW", scope: "Sector", sector: 3, message: "YELLOW IN TRACK SECTOR 3" },
    });
    const row = toRaceControlMessageRow(e);
    expect(row).toMatchObject({ category: "flag", message: "YELLOW IN TRACK SECTOR 3" });
  });

  it("derives a row for a SESSION_STATUS event with category 'message'", () => {
    const e = event({ eventType: "SESSION_STATUS", payload: { status: "aborted", message: "SESSION ABORTED" } });
    expect(toRaceControlMessageRow(e)).toMatchObject({ category: "message", message: "SESSION ABORTED" });
  });

  it("derives a row for the generic RACE_CONTROL_MESSAGE fallback", () => {
    const e = event({
      eventType: "RACE_CONTROL_MESSAGE",
      payload: { category: "Other", message: "RISK OF RAIN FOR F1 RACE IS 0 %", driverId: null },
    });
    expect(toRaceControlMessageRow(e)).toMatchObject({ category: "message" });
  });

  it("returns null for a non-race-control event type, rather than fabricating a row", () => {
    const e = event({ eventType: "LAP_COMPLETED", payload: { driverId: "f1-driver-1", lap: 5, lapTime: "90.123" } });
    expect(toRaceControlMessageRow(e)).toBeNull();
  });
});

describe("toPitStopRow", () => {
  it("derives a row from a PIT_STOP event", () => {
    const e = event({
      eventType: "PIT_STOP",
      payload: { driverId: "f1-driver-1", lap: 12, durationMs: 23500 },
    });
    expect(toPitStopRow(e)).toEqual({
      id: "evt-1",
      sessionId: "f1-session-1",
      driverId: "f1-driver-1",
      lap: 12,
      durationMs: 23500,
      timestamp: "2026-01-01T00:00:00Z",
    });
  });

  it("returns null for a non-pit-stop event type", () => {
    const e = event({ eventType: "FASTEST_LAP", payload: { driverId: "f1-driver-1", lapTime: "88.1", lap: 20 } });
    expect(toPitStopRow(e)).toBeNull();
  });
});

describe("mergeDriverTimingPatches", () => {
  it("merges multiple partial patches for the same driver into one", () => {
    const patches = [
      { sessionId: "s1", driverId: "d1", position: 3 },
      { sessionId: "s1", driverId: "d1", lastLapTime: 90.5 },
      { sessionId: "s1", driverId: "d1", gapToLeader: "+2.500" },
    ];
    const merged = mergeDriverTimingPatches(patches);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual({
      sessionId: "s1",
      driverId: "d1",
      position: 3,
      lastLapTime: 90.5,
      gapToLeader: "+2.500",
    });
  });

  it("keeps separate drivers as separate merged patches", () => {
    const patches = [
      { sessionId: "s1", driverId: "d1", position: 1 },
      { sessionId: "s1", driverId: "d2", position: 2 },
    ];
    expect(mergeDriverTimingPatches(patches)).toHaveLength(2);
  });

  it("later patches win when the same field appears twice", () => {
    const patches = [
      { sessionId: "s1", driverId: "d1", position: 3 },
      { sessionId: "s1", driverId: "d1", position: 2 },
    ];
    expect(mergeDriverTimingPatches(patches)[0].position).toBe(2);
  });

  it("handles an empty list", () => {
    expect(mergeDriverTimingPatches([])).toEqual([]);
  });
});
