import { describe, expect, it } from "vitest";
import { getActiveCricketSessions } from "./activeSessions";
import { config } from "../config";

const HOUR = 60 * 60 * 1000;

function session(id: string, startOffsetMs: number, durationMs: number | null = HOUR) {
  const startTime = new Date(Date.now() + startOffsetMs);
  const endTime = durationMs === null ? null : new Date(startTime.getTime() + durationMs);
  return { id, startTime, endTime };
}

/**
 * `classifySessionState` itself (upcoming/live/completed logic) is already
 * tested against `../f1/activeSessions.test.ts` — this only covers what's
 * genuinely Cricket-specific: real config wiring (its own, much longer
 * max-session-duration default) and the reason text.
 */
describe("getActiveCricketSessions", () => {
  it("selects only the live innings, excluding upcoming and completed ones", () => {
    const upcoming = session("upcoming", HOUR);
    const live = session("live", -30 * 60 * 1000, HOUR);
    const completed = session("completed", -3 * HOUR, HOUR);

    const active = getActiveCricketSessions([upcoming, live, completed]);
    expect(active.map((a) => a.sessionId)).toEqual(["live"]);
  });

  it("uses Cricket's own, much longer max-session-duration default — a Test innings with no known end time and no endTime, 8 hours in, is still live (F1's 4hr cap would have called this completed)", () => {
    const eightHoursIn = session("innings", -8 * HOUR, null);
    const active = getActiveCricketSessions([eightHoursIn]);
    expect(active.map((a) => a.sessionId)).toEqual(["innings"]);
    expect(config.cricketMaxSessionDurationMs).toBeGreaterThan(4 * HOUR);
  });

  it("gives each active target a real reason and Cricket's own configured poll cadence", () => {
    const live = session("live", -10 * 60 * 1000, HOUR);
    const [target] = getActiveCricketSessions([live]);
    expect(target.reason).toContain("10min ago");
    expect(target.pollIntervalMs).toBe(config.cricketPollIntervalMs);
  });

  it("returns an empty list when nothing is live, without throwing", () => {
    expect(getActiveCricketSessions([])).toEqual([]);
  });
});
