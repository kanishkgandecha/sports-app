import { describe, expect, it } from "vitest";
import { buildDriverId, buildSeasonId, buildTeamId, slugify, yearFromSeasonId, F1_COMPETITION } from "./reference";

describe("F1 shared reference", () => {
  it("builds the same driver id format regardless of which provider supplies the number", () => {
    expect(buildDriverId(44)).toBe("f1-driver-44");
  });

  it("builds a team id from an already-resolved slug", () => {
    expect(buildTeamId("red-bull-racing")).toBe("f1-team-red-bull-racing");
  });

  it("builds and parses season ids symmetrically", () => {
    expect(buildSeasonId(2026)).toBe("f1-season-2026");
    expect(yearFromSeasonId("f1-season-2026")).toBe(2026);
  });

  it("throws on a non-season id rather than returning NaN silently", () => {
    expect(() => yearFromSeasonId("not-a-season")).toThrow();
  });

  it("slugifies consistently", () => {
    expect(slugify("Racing Bulls")).toBe("racing-bulls");
    expect(slugify("RB F1 Team")).toBe("rb-f1-team");
  });

  it("exposes the one F1 competition constant", () => {
    expect(F1_COMPETITION.id).toBe("f1-world-championship");
  });
});
