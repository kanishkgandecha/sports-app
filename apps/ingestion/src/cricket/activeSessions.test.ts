import { describe, expect, it } from "vitest";
import { getActiveCricketSessions } from "./activeSessions";
import { config } from "../config";

const HOUR = 60 * 60 * 1000;

function session(
  id: string,
  startOffsetMs: number,
  durationMs: number | null = HOUR,
  status: "scheduled" | "live" | "completed" | "cancelled" = "live",
) {
  const startTime = new Date(Date.now() + startOffsetMs);
  const endTime = durationMs === null ? null : new Date(startTime.getTime() + durationMs);
  return { id, startTime, endTime, status };
}

/**
 * `classifySessionState` itself (upcoming/live/completed logic) is already
 * tested against `../f1/activeSessions.test.ts` — this only covers what's
 * genuinely Cricket-specific: real config wiring (its own, much longer
 * max-session-duration default) and the reason text.
 */
describe("getActiveCricketSessions", () => {
  it("selects a genuinely active innings while excluding scheduled and completed sessions", () => {
    const upcoming = session("upcoming", HOUR, HOUR, "scheduled");
    const live = session("live", -30 * 60 * 1000, HOUR);
    const completed = session("completed", -30 * 60 * 1000, HOUR, "completed");

    const active = getActiveCricketSessions([upcoming, live, completed]);
    expect(active.map((a) => a.sessionId)).toEqual(["live"]);
  });

  it("excludes a completed sibling innings that shares the active innings' match start time", () => {
    const startOffset = -10 * 60 * 1000;
    const active = getActiveCricketSessions([
      session("innings-1-completed", startOffset, null, "completed"),
      session("innings-2-live", startOffset, null, "live"),
    ]);

    expect(active.map((target) => target.sessionId)).toEqual(["innings-2-live"]);
  });

  it("does not select completed, cancelled, or scheduled innings even when their timestamps are within the live window", () => {
    const active = getActiveCricketSessions([
      session("completed", -10 * 60 * 1000, null, "completed"),
      session("cancelled", -10 * 60 * 1000, null, "cancelled"),
      session("scheduled", -10 * 60 * 1000, null, "scheduled"),
    ]);

    expect(active).toEqual([]);
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

/**
 * Cricket Checkpoint 4 (request-budget remediation) — real request volume
 * scales linearly with however many sessions are simultaneously "live";
 * without a cap this is unbounded (a real `currentMatches` snapshot this
 * project captured had 18 matches in flight at once).
 */
describe("getActiveCricketSessions — cricketMaxActiveSessions cap", () => {
  it("caps the number of active sessions at config.cricketMaxActiveSessions, never returning more", () => {
    const many = Array.from({ length: config.cricketMaxActiveSessions + 5 }, (_, i) => session(`live-${i}`, -(i + 1) * 60_000, HOUR));
    const active = getActiveCricketSessions(many);
    expect(active.length).toBe(config.cricketMaxActiveSessions);
  });

  it("prioritizes the earliest-started sessions, deterministically, over more recently started ones", () => {
    // Deliberately out of order — the earliest-started (most negative offset) must still win.
    // durationMs = 2 * HOUR (not the default HOUR) so all three genuinely
    // still classify as live at these offsets (their endTime hasn't
    // passed yet) — the cap logic under test is priority ordering, not
    // lifecycle classification (already covered above).
    const sessions = [
      session("started-10min-ago", -10 * 60_000, 2 * HOUR),
      session("started-90min-ago", -90 * 60_000, 2 * HOUR),
      session("started-45min-ago", -45 * 60_000, 2 * HOUR),
    ];
    const active = getActiveCricketSessions(sessions);
    expect(active.map((a) => a.sessionId)).toEqual(["started-90min-ago", "started-45min-ago", "started-10min-ago"].slice(0, config.cricketMaxActiveSessions));
  });

  it("breaks equal start-time ties by session id, making cap selection deterministic", () => {
    const sameStart = -10 * 60_000;
    const sessions = [
      session("innings-c", sameStart, HOUR),
      session("innings-a", sameStart, HOUR),
      session("innings-b", sameStart, HOUR),
      session("completed-sibling", sameStart, HOUR, "completed"),
    ];

    const active = getActiveCricketSessions(sessions);
    expect(active.map((target) => target.sessionId)).toEqual(
      ["innings-a", "innings-b", "innings-c"].slice(0, config.cricketMaxActiveSessions),
    );
  });

  it("does not cap or reorder when the number of live sessions is at or under the limit", () => {
    const sessions = [session("a", -10 * 60_000, HOUR), session("b", -20 * 60_000, HOUR)];
    const active = getActiveCricketSessions(sessions);
    expect(active.map((a) => a.sessionId)).toEqual(["b", "a"]); // still sorted earliest-first, just not truncated
  });
});
