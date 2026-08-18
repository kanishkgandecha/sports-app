import { describe, expect, it } from "vitest";
import { diffInningsScore, diffMatchStatus, normalizeBalls } from "./events";
import type { CricketDataMatchSummary } from "../types";
import inningsBreakInfo from "../fixtures/matchInfo.inningsBreak.json";
import bbbConstructed from "../fixtures/matchBbb.CONSTRUCTED.json";
import bbbNotFound from "../fixtures/matchBbb.notFound.json";

const inningsBreakMatch = inningsBreakInfo.data as CricketDataMatchSummary;

describe("diffInningsScore — the real, always-available fallback (match_bbb was unavailable for every real match sampled)", () => {
  const sessionId = "cricket-match-e9d200fb-innings-1";

  it("emits nothing on the first poll (no previous state to diff against)", () => {
    const events = diffInningsScore(undefined, { r: 10, w: 0, o: 2, inning: "x" }, { sessionId, timestamp: "2026-08-18T14:00:00Z", dismissalText: null });
    expect(events).toEqual([]);
  });

  it("emits nothing when nothing changed", () => {
    const entry = { r: 10, w: 0, o: 2, inning: "x" };
    const events = diffInningsScore(entry, entry, { sessionId, timestamp: "2026-08-18T14:00:00Z", dismissalText: null });
    expect(events).toEqual([]);
  });

  it("emits a SCORE_UPDATE when runs/overs change but wickets don't", () => {
    const events = diffInningsScore(
      { r: 10, w: 0, o: 2, inning: "x" },
      { r: 14, w: 0, o: 2.4, inning: "x" },
      { sessionId, timestamp: "2026-08-18T14:05:00Z", dismissalText: null },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("SCORE_UPDATE");
    expect(events[0].payload).toMatchObject({ runs: 14, wickets: 0, overs: 2.4, deltaRuns: 4, deltaWickets: 0 });
  });

  it("emits a WICKET (not a generic SCORE_UPDATE) when wickets increase", () => {
    const events = diffInningsScore(
      { r: 14, w: 0, o: 2.4, inning: "x" },
      { r: 14, w: 1, o: 2.5, inning: "x" },
      { sessionId, timestamp: "2026-08-18T14:06:00Z", dismissalText: "b Agnes Qwele" },
    );
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("WICKET");
    expect(events[0].payload).toMatchObject({ wickets: 1, dismissalText: "b Agnes Qwele" });
  });

  it("produces the same LiveEvent id for the same diff (idempotent re-processing)", () => {
    const a = diffInningsScore({ r: 10, w: 0, o: 2, inning: "x" }, { r: 14, w: 0, o: 2.4, inning: "x" }, { sessionId, timestamp: "t1", dismissalText: null });
    const b = diffInningsScore({ r: 10, w: 0, o: 2, inning: "x" }, { r: 14, w: 0, o: 2.4, inning: "x" }, { sessionId, timestamp: "t2", dismissalText: null });
    expect(a[0].id).toBe(b[0].id);
  });
});

describe("diffMatchStatus — real free-text status transitions", () => {
  const input = { fixtureId: "cricket-match-e9d200fb", sessionId: "cricket-match-e9d200fb-innings-2", timestamp: "2026-08-18T14:10:00Z" };

  it("emits nothing on the first observation", () => {
    expect(diffMatchStatus(undefined, inningsBreakMatch, input)).toEqual([]);
  });

  it("emits nothing when status is unchanged", () => {
    expect(diffMatchStatus(inningsBreakMatch.status, inningsBreakMatch, input)).toEqual([]);
  });

  it("emits a MATCH_STATUS event with the real, verbatim provider text when status changes", () => {
    const events = diffMatchStatus("Innings Break", inningsBreakMatch, input);
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("MATCH_STATUS");
    expect(events[0].payload).toEqual({ status: inningsBreakMatch.status });
  });
});

describe("normalizeBalls — verified real failure mode, plus the CONSTRUCTED (unverified) success shape", () => {
  it("returns [] for the real, confirmed 'not able to get BBB' failure — never throws", () => {
    const events = normalizeBalls(bbbNotFound as never, { sessionId: "s", timestamp: "t" });
    expect(events).toEqual([]);
  });

  it("parses the CONSTRUCTED (not real) success shape without throwing, producing one BALL event per ball including a wicket and an extra", () => {
    const events = normalizeBalls(bbbConstructed as never, { sessionId: "cricket-match-e9d200fb-innings-1", timestamp: "t" });
    expect(events).toHaveLength(3);
    expect(events.every((e) => e.eventType === "BALL")).toBe(true);
    const wicketBall = events.find((e) => (e.payload as { wicket: unknown }).wicket !== null);
    expect(wicketBall).toBeDefined();
    const extraBall = events.find((e) => (e.payload as { extras: unknown }).extras !== null);
    expect(extraBall).toBeDefined();
  });

  it("returns [] for a malformed/unexpected response shape rather than throwing", () => {
    expect(normalizeBalls({ status: "success", data: { id: "x", bbb: "not-an-array" } } as never, { sessionId: "s", timestamp: "t" })).toEqual([]);
    expect(normalizeBalls({ status: "success" } as never, { sessionId: "s", timestamp: "t" })).toEqual([]);
  });
});
