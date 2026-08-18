import { describe, expect, it } from "vitest";
import { normalizeTeams } from "./team";
import type { CricketDataMatchSummary } from "../types";
import currentMatchesFixture from "../fixtures/currentMatches.json";

const matches = currentMatchesFixture.data as CricketDataMatchSummary[];

describe("normalizeTeams — real teamInfo", () => {
  it("normalizes both real teams, never fabricating a color (none exists in this provider's data)", () => {
    const match = matches.find((m) => m.id === "e9d200fb-3c43-4852-9c93-9160517d7b36")!;
    const teams = normalizeTeams(match);
    expect(teams).toHaveLength(2);
    expect(teams[0]).toEqual({
      id: "cricket-team-chepauk-super-gillies",
      sportId: "cricket",
      name: "Chepauk Super Gillies",
      slug: "chepauk-super-gillies",
      country: null,
      colorHex: null,
    });
  });

  it("never fabricates a shortname when the real team has none", () => {
    const match = matches.find((m) => m.teamInfo.some((t) => !t.shortname));
    expect(match).toBeDefined();
    // shortname isn't part of our Team model at all — this just confirms
    // normalization doesn't throw or invent one when absent.
    expect(() => normalizeTeams(match!)).not.toThrow();
  });
});
