import { describe, expect, it, vi } from "vitest";
import { JOLPICA_CONSTRUCTOR_TO_TEAM_SLUG, resolveTeamSlug } from "./constructorMapping";

describe("resolveTeamSlug — real 2026 constructor identity mismatches (docs/CONTEXT.md Checkpoint 6 §2)", () => {
  it("resolves all 5 real mismatches found by comparing Jolpica's response against our real Team table", () => {
    expect(resolveTeamSlug("red_bull")).toBe("red-bull-racing");
    expect(resolveTeamSlug("rb")).toBe("racing-bulls");
    expect(resolveTeamSlug("haas")).toBe("haas-f1-team");
    expect(resolveTeamSlug("aston_martin")).toBe("aston-martin");
    expect(resolveTeamSlug("cadillac")).toBe("cadillac");
  });

  it("resolves every constructorId in the mapping table without a naive-slugify fallback warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const constructorId of Object.keys(JOLPICA_CONSTRUCTOR_TO_TEAM_SLUG)) {
      resolveTeamSlug(constructorId);
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("falls back to a slugified constructorId (and warns) for an unrecognized/future constructor, rather than throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveTeamSlug("some_new_team_2027")).toBe("some-new-team-2027");
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
