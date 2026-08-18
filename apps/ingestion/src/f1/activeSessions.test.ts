import { describe, expect, it } from "vitest";
import { classifySessionState, getActiveF1Sessions } from "./activeSessions";

const HOUR = 60 * 60 * 1000;

function session(id: string, startOffsetMs: number, durationMs: number | null = HOUR) {
  const startTime = new Date(Date.now() + startOffsetMs);
  const endTime = durationMs === null ? null : new Date(startTime.getTime() + durationMs);
  return { id, startTime, endTime };
}

describe("classifySessionState", () => {
  it("classifies a session that hasn't started yet as upcoming", () => {
    const s = session("s1", 30 * 60 * 1000); // starts in 30 min
    expect(classifySessionState(s, new Date())).toBe("upcoming");
  });

  it("classifies a session currently between start and end as live", () => {
    const s = session("s1", -30 * 60 * 1000, HOUR); // started 30 min ago, 1hr long
    expect(classifySessionState(s, new Date())).toBe("live");
  });

  it("classifies a session past its end time as completed", () => {
    const s = session("s1", -3 * HOUR, HOUR); // started 3hr ago, 1hr long
    expect(classifySessionState(s, new Date())).toBe("completed");
  });

  it("caps a session with no endTime at maxDurationMs, rather than treating it as live forever", () => {
    const s = session("s1", -5 * HOUR, null); // started 5hr ago, no known end
    expect(classifySessionState(s, new Date(), 4 * HOUR)).toBe("completed");
  });

  it("treats a session with no endTime as live while still within maxDurationMs", () => {
    const s = session("s1", -1 * HOUR, null); // started 1hr ago, no known end
    expect(classifySessionState(s, new Date(), 4 * HOUR)).toBe("live");
  });

  it("caps even a session with a suspiciously far-future endTime at maxDurationMs", () => {
    const s = session("s1", -5 * HOUR, 100 * HOUR); // a corrupt/bad endTime far in the future
    expect(classifySessionState(s, new Date(), 4 * HOUR)).toBe("completed");
  });
});

describe("getActiveF1Sessions", () => {
  it("selects only the live session, excluding upcoming and completed ones", () => {
    const upcoming = session("upcoming", HOUR);
    const live = session("live", -30 * 60 * 1000, HOUR);
    const completed = session("completed", -3 * HOUR, HOUR);

    const active = getActiveF1Sessions([upcoming, live, completed]);
    expect(active.map((a) => a.sessionId)).toEqual(["live"]);
  });

  it("returns an empty list when nothing is live", () => {
    const upcoming = session("upcoming", HOUR);
    const completed = session("completed", -3 * HOUR, HOUR);
    expect(getActiveF1Sessions([upcoming, completed])).toEqual([]);
  });

  it("gives each active target a reason and a configured poll cadence", () => {
    const live = session("live", -10 * 60 * 1000, HOUR);
    const [target] = getActiveF1Sessions([live]);
    expect(target.reason).toContain("10min ago");
    expect(target.pollIntervalMs).toBeGreaterThan(0);
  });

  it("handles an empty session list without throwing", () => {
    expect(getActiveF1Sessions([])).toEqual([]);
  });
});
