import { describe, expect, it } from "vitest";
import type { OpenF1Interval, OpenF1Lap, OpenF1Pit, OpenF1Position, OpenF1Stint } from "../types";
import {
  diffPosition,
  formatGap,
  intervalTimingPatch,
  lapTimingPatch,
  normalizeLap,
  normalizePitStop,
  normalizeStint,
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

describe("normalizePitStop — resolved from real evidence (see fixtures/README.md)", () => {
  it("prefers pit_duration, which was verified equal to lane_duration in every real sample", () => {
    const pit = realPits.find((p) => p.pit_duration !== null)!;
    expect(pit.pit_duration).toBe(pit.lane_duration); // the verified invariant
    const event = normalizePitStop(pit, { sessionId: "s" });
    expect(event!.payload.durationMs).toBe(Math.round(pit.pit_duration! * 1000));
  });

  it("emits nothing when both pit_duration and lane_duration are null, never fabricating a duration", () => {
    const event = normalizePitStop(
      { ...realPits[0], pit_duration: null, lane_duration: null },
      { sessionId: "s" },
    );
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
