import { describe, expect, it } from "vitest";
import { normalizeConstructorStanding, normalizeDriverStanding } from "./standing";
import type { JolpicaConstructorStanding, JolpicaDriverStanding } from "../types";
import driverStandingsFixture from "../fixtures/driverStandings.2026.json";
import constructorStandingsFixture from "../fixtures/constructorStandings.2026.json";

const driverStandings = driverStandingsFixture.MRData.StandingsTable.StandingsLists[0]
  .DriverStandings as JolpicaDriverStanding[];
const constructorStandings = constructorStandingsFixture.MRData.StandingsTable.StandingsLists[0]
  .ConstructorStandings as JolpicaConstructorStanding[];

describe("normalizeDriverStanding — real 2026 driver standings", () => {
  const input = { competitionId: "f1-world-championship", year: 2026 };

  it("normalizes the real P1 (Antonelli, 219pts, 6 wins, permanentNumber 12) correctly", () => {
    const standing = normalizeDriverStanding(driverStandings[0], input);
    expect(standing).toEqual({
      id: "jolpica-standing-2026-driver-f1-driver-12",
      competitionId: "f1-world-championship",
      seasonId: "f1-season-2026",
      entityType: "player",
      entityId: "f1-driver-12",
      points: 219,
      position: 1,
      extra: {
        wins: 6,
        driverCode: "ANT",
        driverName: "Andrea Kimi Antonelli",
        teamId: "f1-team-mercedes",
        teamName: "Mercedes",
        constructorHistory: ["f1-team-mercedes"],
      },
    });
  });

  it("maps permanentNumber to the same f1-driver-{number} id OpenF1Adapter builds (cross-provider identity, verified against real DB rows — docs/CONTEXT.md Checkpoint 6 §2)", () => {
    const hamilton = driverStandings.find((d) => d.Driver.driverId === "hamilton")!;
    const standing = normalizeDriverStanding(hamilton, input);
    expect(standing?.entityId).toBe("f1-driver-44");
  });

  it("championship position and points are numeric, not the raw strings Jolpica sends", () => {
    const standing = normalizeDriverStanding(driverStandings[4], input); // Norris, P5
    expect(typeof standing?.position).toBe("number");
    expect(typeof standing?.points).toBe("number");
    expect(standing?.position).toBe(5);
    expect(standing?.points).toBe(128);
  });

  it("returns undefined and does not throw for a driver missing permanentNumber (some historical drivers legitimately have none)", () => {
    const noNumber: JolpicaDriverStanding = {
      ...driverStandings[0],
      Driver: { ...driverStandings[0].Driver, permanentNumber: undefined },
    };
    expect(normalizeDriverStanding(noNumber, input)).toBeUndefined();
  });

  it("returns undefined for a malformed non-numeric permanentNumber rather than producing a garbage id", () => {
    const malformed: JolpicaDriverStanding = {
      ...driverStandings[0],
      Driver: { ...driverStandings[0].Driver, permanentNumber: "not-a-number" },
    };
    expect(normalizeDriverStanding(malformed, input)).toBeUndefined();
  });

  it("maps the mid-season-team-change constructorId list to a full teamId history, using the most recent as the current team", () => {
    const multiTeam: JolpicaDriverStanding = {
      ...driverStandings[0],
      Constructors: [
        { constructorId: "williams", url: "", name: "Williams", nationality: "British" },
        { constructorId: "red_bull", url: "", name: "Red Bull", nationality: "Austrian" },
      ],
    };
    const standing = normalizeDriverStanding(multiTeam, input);
    expect(standing?.extra.teamId).toBe("f1-team-red-bull-racing");
    expect(standing?.extra.constructorHistory).toEqual(["f1-team-williams", "f1-team-red-bull-racing"]);
  });
});

describe("normalizeConstructorStanding — real 2026 constructor standings", () => {
  const input = { competitionId: "f1-world-championship", year: 2026 };

  it("normalizes the real P1 constructor (Mercedes, 379pts, 8 wins)", () => {
    const standing = normalizeConstructorStanding(constructorStandings[0], input);
    expect(standing).toEqual({
      id: "jolpica-standing-2026-constructor-f1-team-mercedes",
      competitionId: "f1-world-championship",
      seasonId: "f1-season-2026",
      entityType: "team",
      entityId: "f1-team-mercedes",
      points: 379,
      position: 1,
      extra: { wins: 8, teamName: "Mercedes", jolpicaConstructorId: "mercedes" },
    });
  });

  it("resolves red_bull to our real f1-team-red-bull-racing slug, not a naive f1-team-red-bull", () => {
    const redBull = constructorStandings.find((c) => c.Constructor.constructorId === "red_bull")!;
    const standing = normalizeConstructorStanding(redBull, input);
    expect(standing.entityId).toBe("f1-team-red-bull-racing");
  });

  it('resolves rb ("RB F1 Team") to our real f1-team-racing-bulls slug — the mismatch where even the display name differs', () => {
    const rb = constructorStandings.find((c) => c.Constructor.constructorId === "rb")!;
    const standing = normalizeConstructorStanding(rb, input);
    expect(standing.entityId).toBe("f1-team-racing-bulls");
  });

  it("normalizes every real 2026 constructor without throwing (all 11)", () => {
    expect(constructorStandings.length).toBe(11);
    for (const entry of constructorStandings) {
      expect(() => normalizeConstructorStanding(entry, input)).not.toThrow();
    }
  });
});
