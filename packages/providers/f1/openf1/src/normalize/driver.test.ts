import { describe, expect, it } from "vitest";
import type { OpenF1Driver } from "../types";
import { normalizePlayer, normalizeTeam } from "./driver";
import drivers from "../fixtures/drivers.belgium2024race.json";

const realDrivers = drivers as OpenF1Driver[];
const verstappen = realDrivers.find((d) => d.driver_number === 1)!;

describe("normalizeTeam", () => {
  it("normalizes team_colour into a CSS-ready hex string", () => {
    const team = normalizeTeam(verstappen);
    expect(team.colorHex).toBe("#3671C6");
    expect(team.name).toBe("Red Bull Racing");
    expect(team.slug).toBe("red-bull-racing");
    expect(team.country).toBeNull(); // OpenF1 has no team nationality field — documented gap, not fabricated
  });

  it("handles a null team_colour without throwing", () => {
    const team = normalizeTeam({ ...verstappen, team_colour: null });
    expect(team.colorHex).toBeNull();
  });

  it("produces the same team id for every driver on the same team (dedup key)", () => {
    const teammates = realDrivers.filter((d) => d.team_name === verstappen.team_name);
    expect(teammates.length).toBeGreaterThan(1);
    const ids = new Set(teammates.map((d) => normalizeTeam(d).id));
    expect(ids.size).toBe(1);
  });
});

describe("normalizePlayer", () => {
  it("normalizes a real driver into a Player with the F1-specific display fields populated", () => {
    const player = normalizePlayer(verstappen);
    expect(player).toEqual({
      id: "f1-driver-1",
      sportId: "f1",
      teamId: "f1-team-red-bull-racing",
      name: "Max VERSTAPPEN",
      role: "driver",
      shortName: "VER",
      avatarUrl: verstappen.headshot_url,
    });
  });

  it("handles a null headshot_url without throwing", () => {
    const player = normalizePlayer({ ...verstappen, headshot_url: null });
    expect(player.avatarUrl).toBeNull();
  });
});
