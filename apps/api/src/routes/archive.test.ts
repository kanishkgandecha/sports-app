import { describe, expect, it } from "vitest";
import { classifyArchiveFixture, parseQuery, summarizeSessionCoverage } from "./archive";

describe("archive query validation", () => {
  it("defaults to F1 and applies a bounded default", () => {
    const parsed = parseQuery({});
    expect("error" in parsed).toBe(false);
    if (!("error" in parsed)) expect(parsed.limit).toBe(24);
  });

  it("rejects non-F1 and unsafe pagination values", () => {
    expect(parseQuery({ sport: "other" })).toEqual({ error: "only Formula 1 archives are available" });
    expect(parseQuery({ limit: "51" })).toEqual({ error: "limit must be an integer from 1 to 50" });
    expect(parseQuery({ cursor: "not-a-cursor" })).toEqual({ error: "invalid cursor" });
    expect(parseQuery({ kind: "cricket" })).toEqual({ error: "invalid kind" });
  });

  it("uses inclusive calendar dates and rejects reversed ranges before querying", () => {
    expect(parseQuery({ from: "2024-02-01", to: "2024-01-01" })).toEqual({
      error: "from must not be after to",
    });
    expect(parseQuery({ from: "not-a-date" })).toEqual({ error: "from must be YYYY-MM-DD" });
  });
});

describe("archive session coverage", () => {
  const now = new Date("2026-01-02T00:00:00Z");
  const session = (id: string, status: string | null) => ({
    id,
    status: "completed",
    endTime: new Date("2026-01-01T02:00:00Z"),
    dataProfile: status ? { status, reason: null } : null,
    type: "RACE",
  });

  it("reports partial coverage when only some completed sessions are available", () => {
    expect(summarizeSessionCoverage([session("race", "available"), session("fp1", null)], new Set(), now)).toEqual({
      total: 2,
      available: 1,
      unavailable: 0,
      failed: 0,
      importing: 0,
      coverage: "partial",
    });
  });

  it("separates provider gaps and failures from unattempted summaries", () => {
    expect(
      summarizeSessionCoverage(
        [session("race", "available"), session("fp1", "upstream-unavailable"), session("fp2", "failed")],
        new Set(),
        now,
      ),
    ).toMatchObject({ total: 3, available: 1, unavailable: 1, failed: 1, coverage: "partial" });
  });

  it("recognizes legacy detailed rows during migration compatibility", () => {
    expect(summarizeSessionCoverage([session("race", null)], new Set(["race"]), now).coverage).toBe("event-data");
  });
});

describe("archive fixture classification", () => {
  it("distinguishes race weekends from pre-season testing", () => {
    expect(classifyArchiveFixture("Dutch Grand Prix", [{ type: "FP1" }, { type: "RACE" }])).toBe("race-weekend");
    expect(classifyArchiveFixture("Pre-Season Testing", [{ type: "DAY_1" }, { type: "DAY_2" }])).toBe("testing");
  });
});
