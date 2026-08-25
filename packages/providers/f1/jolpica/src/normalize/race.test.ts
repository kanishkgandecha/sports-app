import { describe, expect, it } from "vitest";
import { normalizeRace, normalizeRaceSessions, normalizeVenue } from "./race";
import type { JolpicaRace } from "../types";
import racesFixture from "../fixtures/races.2026.sample.json";

const races = racesFixture.MRData.RaceTable.Races as JolpicaRace[];
const australianGp = races[0]; // round 1 — normal weekend: FP1/FP2/FP3/Qualifying/Race, no Sprint
const chineseGp = races[1]; // round 2 — sprint weekend: FP1 only + Sprint/SprintQualifying

describe("normalizeRace — real 2026 races", () => {
  const input = { competitionId: "f1-world-championship", seasonId: "f1-season-2026", now: new Date("2026-08-18") };

  it("normalizes the real Australian GP (round 1) as completed, since it's before the fixed 'now'", () => {
    const fixture = normalizeRace(australianGp, input);
    expect(fixture.id).toBe("f1-jolpica-race-2026-1");
    expect(fixture.name).toBe("Australian Grand Prix");
    expect(fixture.status).toBe("completed");
    expect(fixture.startTime).toBe("2026-03-08T04:00:00Z");
    expect(fixture.venueId).toBe("f1-jolpica-circuit-albert_park");
  });

  it("normalizes a future race as scheduled", () => {
    const fixture = normalizeRace(australianGp, { ...input, now: new Date("2020-01-01") });
    expect(fixture.status).toBe("scheduled");
  });
});

describe("normalizeVenue", () => {
  it("normalizes the real Albert Park circuit", () => {
    const venue = normalizeVenue(australianGp);
    expect(venue).toEqual({
      id: "f1-jolpica-circuit-albert_park",
      name: "Albert Park Grand Prix Circuit",
      country: "Australia",
      timezone: "UTC",
    });
  });
});

describe("normalizeRaceSessions — real 2026 races, both weekend formats", () => {
  it("normalizes a normal (non-sprint) weekend to FP1/FP2/FP3/Qualifying/Race — 5 sessions", () => {
    const sessions = normalizeRaceSessions(australianGp, { fixtureId: "f1-jolpica-race-2026-1" });
    expect(sessions.map((s) => s.type)).toEqual(["FP1", "FP2", "FP3", "QUALIFYING", "RACE"]);
  });

  it("normalizes a real sprint weekend (round 2, Chinese GP) to the sessions actually present: FP1, SprintQualifying, Sprint, Qualifying, Race — no FP2/FP3", () => {
    const sessions = normalizeRaceSessions(chineseGp, { fixtureId: "f1-jolpica-race-2026-2" });
    const types = sessions.map((s) => s.type);
    expect(types).toContain("FP1");
    expect(types).toContain("SPRINT");
    expect(types).toContain("SPRINT_QUALIFYING");
    expect(types).toContain("QUALIFYING");
    expect(types).not.toContain("FP2");
    expect(types).not.toContain("FP3");
  });

  it("does not fabricate a session for a field the real response doesn't have", () => {
    const sessions = normalizeRaceSessions(chineseGp, { fixtureId: "f1-jolpica-race-2026-2" });
    // Real fields on this round: FirstPractice, Qualifying, Sprint, SprintQualifying, plus the race itself — 5, not the 6 a normal FP1/FP2/FP3/Quali/Race weekend would have.
    expect(sessions.length).toBe(5);
  });
});
