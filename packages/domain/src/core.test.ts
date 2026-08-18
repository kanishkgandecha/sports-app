import { describe, expect, it } from "vitest";
import { computeFreshness } from "./core";

const NOW = new Date("2026-01-01T12:00:00Z").getTime();

describe("computeFreshness", () => {
  it("is never LIVE or DELAYED for a session that isn't actually live", () => {
    expect(computeFreshness({ lastEventAt: new Date(NOW).toISOString(), isLive: false, now: NOW })).toEqual({
      state: "offline",
      updatedAt: new Date(NOW).toISOString(),
    });
  });

  it("is OFFLINE (not fabricated) for a live session with no data yet", () => {
    expect(computeFreshness({ lastEventAt: null, isLive: true, now: NOW })).toEqual({
      state: "offline",
      updatedAt: null,
    });
  });

  it("is LIVE within the live threshold", () => {
    const lastEventAt = new Date(NOW - 5_000).toISOString();
    expect(computeFreshness({ lastEventAt, isLive: true, now: NOW })).toEqual({ state: "live", updatedAt: lastEventAt });
  });

  it("is DELAYED between the live and delayed thresholds", () => {
    const lastEventAt = new Date(NOW - 45_000).toISOString();
    expect(computeFreshness({ lastEventAt, isLive: true, now: NOW })).toEqual({ state: "delayed", updatedAt: lastEventAt });
  });

  it("is OFFLINE beyond the delayed threshold — stale data is never shown as live or merely delayed", () => {
    const lastEventAt = new Date(NOW - 5 * 60_000).toISOString();
    expect(computeFreshness({ lastEventAt, isLive: true, now: NOW })).toEqual({ state: "offline", updatedAt: lastEventAt });
  });

  it("treats the exact live threshold boundary as still LIVE", () => {
    const lastEventAt = new Date(NOW - 20_000).toISOString();
    expect(computeFreshness({ lastEventAt, isLive: true, now: NOW }).state).toBe("live");
  });
});
