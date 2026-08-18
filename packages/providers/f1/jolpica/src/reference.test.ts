import { describe, expect, it } from "vitest";
import { buildFixtureId, buildSessionId, buildTeamId, buildVenueId, fixtureRefFromId } from "./reference";

describe("Jolpica-scoped reference ids", () => {
  it("builds a fixture id from (year, round) — intentionally not the same format as OpenF1's f1-meeting-{key}", () => {
    expect(buildFixtureId(2026, "1")).toBe("f1-jolpica-race-2026-1");
  });

  it("builds and parses fixture ids symmetrically", () => {
    const id = buildFixtureId(2026, "11");
    expect(fixtureRefFromId(id)).toEqual({ year: 2026, round: "11" });
  });

  it("throws on a non-Jolpica fixture id rather than silently returning garbage", () => {
    expect(() => fixtureRefFromId("f1-meeting-1279")).toThrow();
  });

  it("builds a session id from (year, round, type)", () => {
    expect(buildSessionId(2026, "1", "RACE")).toBe("f1-jolpica-session-2026-1-RACE");
  });

  it("builds a venue id from a Jolpica circuitId", () => {
    expect(buildVenueId("albert_park")).toBe("f1-jolpica-circuit-albert_park");
  });

  it("applies the shared f1-team-{slug} format to an already-resolved slug", () => {
    expect(buildTeamId("racing-bulls")).toBe("f1-team-racing-bulls");
  });
});
