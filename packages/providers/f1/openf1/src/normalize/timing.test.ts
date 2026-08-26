import { describe, expect, it } from "vitest";
import type { OpenF1Interval, OpenF1Lap, OpenF1Pit, OpenF1Position, OpenF1SessionResult, OpenF1Stint } from "../types";
import {
  diffPosition,
  formatGap,
  intervalTimingPatch,
  lapTimingPatch,
  normalizeLap,
  normalizeLapRecord,
  normalizePitStop,
  normalizeSessionClassification,
  normalizeStint,
  normalizeTyreStint,
  sessionResultTimingPatch,
} from "./timing";
import lapFixture from "../fixtures/laps.sample.json";
import pitFixture from "../fixtures/pit.belgium2024race.json";
import positionFixture from "../fixtures/position.sample.json";
import intervalFixture from "../fixtures/intervals.sample.json";
import stintFixture from "../fixtures/stints.sample.json";

const realLap = (lapFixture as OpenF1Lap[])[0];
const realPits = pitFixture as OpenF1Pit[];
const realPositions = positionFixture as OpenF1Position[];
const realIntervals = intervalFixture as OpenF1Interval[];
const realStint = (stintFixture as OpenF1Stint[])[0];

describe("formatGap — mixed number/string OpenF1 source data", () => {
  it("formats a positive numeric gap with a leading +", () => {
    expect(formatGap(8.7)).toBe("+8.700");
  });

  it("formats a zero gap (the session leader) distinctly, not as '+0.000'", () => {
    expect(formatGap(0)).toBe("0.000");
  });

  it("passes an already-formatted lapped-car string through unchanged", () => {
    expect(formatGap("+1 LAP")).toBe("+1 LAP");
  });

  it("passes null through as null, never fabricating a value", () => {
    expect(formatGap(null)).toBeNull();
  });
});

describe("normalizeLap", () => {
  it("normalizes a real lap into a LAP_COMPLETED event with a numeric-derived formatted lap time", () => {
    const event = normalizeLap(realLap, { sessionId: "f1-session-9574" });
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("LAP_COMPLETED");
    expect(event!.payload).toEqual({
      driverId: "f1-driver-1",
      lap: 5,
      lapTime: realLap.lap_duration!.toFixed(3),
    });
  });

  it("emits nothing for a lap with no duration yet, rather than fabricating a zero", () => {
    const event = normalizeLap({ ...realLap, lap_duration: null }, { sessionId: "s" });
    expect(event).toBeNull();
  });
});

describe("lapTimingPatch", () => {
  it("carries raw numeric sector times, not formatted strings", () => {
    const patch = lapTimingPatch(realLap, "f1-session-9574");
    expect(typeof patch.sector1).toBe("number");
    expect(patch.lastLapTime).toBe(realLap.lap_duration);
  });
});

describe("diffPosition", () => {
  it("emits nothing when there is no previous known position (first reading)", () => {
    const event = diffPosition(undefined, realPositions[0], { sessionId: "s" });
    expect(event).toBeNull();
  });

  it("emits nothing when position hasn't changed", () => {
    const event = diffPosition(realPositions[0].position, realPositions[0], { sessionId: "s" });
    expect(event).toBeNull();
  });

  it("emits a POSITION_CHANGE event when position has changed, using real consecutive readings", () => {
    // Real fixture: driver 1 goes 11 -> 10 across the first two readings.
    const [first, second] = realPositions;
    const event = diffPosition(first.position, second, { sessionId: "f1-session-9574" });
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe("POSITION_CHANGE");
    expect(event!.payload).toEqual({ driverId: "f1-driver-1", from: first.position, to: second.position });
  });
});

describe("sessionResultTimingPatch", () => {
  it("uses the completed-session classification without inventing a result", () => {
    const result: OpenF1SessionResult = {
      session_key: 9574,
      meeting_key: 1242,
      driver_number: 1,
      position: 1,
      number_of_laps: 44,
      points: 25,
      dnf: false,
      dns: false,
      dsq: false,
      duration: 4930.2,
      gap_to_leader: 0,
    };
    expect(sessionResultTimingPatch(result, "f1-session-9574")).toMatchObject({
      driverId: "f1-driver-1",
      position: 1,
      gapToLeader: "0.000",
      state: "running",
    });
    expect(sessionResultTimingPatch({ ...result, position: null, dnf: true }, "f1-session-9574")).toMatchObject({
      position: 0,
      state: "dnf",
    });
  });

  it("uses the last non-null phase gap returned by qualifying sessions", () => {
    const result: OpenF1SessionResult = {
      session_key: 11344,
      meeting_key: 1292,
      driver_number: 11,
      position: 21,
      number_of_laps: 7,
      dnf: false,
      dns: false,
      dsq: false,
      duration: [75.545, null, null],
      gap_to_leader: [2.534, null, null],
    };
    expect(sessionResultTimingPatch(result, "f1-session-11344").gapToLeader).toBe("+2.534");
  });
});

describe("Phase 2 analysis normalization", () => {
  const result: OpenF1SessionResult = {
    session_key: 11344,
    meeting_key: 1292,
    driver_number: 11,
    position: 21,
    number_of_laps: 7,
    points: null,
    dnf: false,
    dns: false,
    dsq: false,
    duration: [75.545, null, null],
    gap_to_leader: [2.534, null, null],
  };

  it("preserves qualifying phases and null eliminations in the classification", () => {
    expect(normalizeSessionClassification(result, "f1-session-11344")).toMatchObject({
      id: "openf1-result-11344-11",
      driverId: "f1-driver-11",
      position: 21,
      status: "classified",
      lapsCompleted: 7,
      durationSeconds: null,
      phase1Duration: 75.545,
      phase2Duration: null,
      phase3Duration: null,
      phase1Gap: "+2.534",
      gapToLeader: "+2.534",
    });
  });

  it("preserves every lap timing and speed field, including null duration", () => {
    expect(normalizeLapRecord({ ...realLap, lap_duration: null }, "f1-session-9574")).toMatchObject({
      driverId: "f1-driver-1",
      lapNumber: realLap.lap_number,
      duration: null,
      sector1: realLap.duration_sector_1,
      speedTrap: realLap.st_speed,
      isPitOutLap: realLap.is_pit_out_lap,
    });
  });

  it("preserves stint boundaries, compound, and tyre age", () => {
    expect(normalizeTyreStint(realStint, "f1-session-9574")).toMatchObject({
      driverId: `f1-driver-${realStint.driver_number}`,
      stintNumber: realStint.stint_number,
      lapStart: realStint.lap_start,
      lapEnd: realStint.lap_end,
      compound: realStint.compound,
      tyreAgeAtStart: realStint.tyre_age_at_start,
    });
  });
});

describe("normalizePitStop — resolved from real evidence (see fixtures/README.md)", () => {
  it("prefers pit_duration, which was verified equal to lane_duration in every real sample", () => {
    const pit = realPits.find((p) => p.pit_duration !== null)!;
    expect(pit.pit_duration).toBe(pit.lane_duration); // the verified invariant
    const event = normalizePitStop(pit, { sessionId: "s" });
    expect(event!.payload.durationMs).toBe(Math.round(pit.pit_duration! * 1000));
  });

  it("emits nothing when both pit_duration and lane_duration are null, never fabricating a duration", () => {
    const event = normalizePitStop({ ...realPits[0], pit_duration: null, lane_duration: null }, { sessionId: "s" });
    expect(event).toBeNull();
  });

  it("does not depend on stop_duration, which was null in every real sample checked", () => {
    expect(realPits.every((p) => p.stop_duration === null)).toBe(true);
  });
});

describe("intervalTimingPatch", () => {
  it("normalizes real interval data into a DriverTiming patch", () => {
    const patch = intervalTimingPatch(realIntervals[0], "f1-session-9574");
    expect(patch.driverId).toBe(`f1-driver-${realIntervals[0].driver_number}`);
    expect(patch.gapToLeader).toBe(formatGap(realIntervals[0].gap_to_leader));
    expect(patch.intervalToAhead).toBe(formatGap(realIntervals[0].interval));
  });
});

describe("normalizeStint", () => {
  it("passes the compound straight through — real data matches our TyreCompound naming", () => {
    const patch = normalizeStint(realStint, "f1-session-9574");
    expect(["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]).toContain(patch.tyreCompound);
  });
});
