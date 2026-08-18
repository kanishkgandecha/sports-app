import { describe, expect, it } from "vitest";
import { sportsProviderContractTests } from "@sports/providers-core/testing";
import { JolpicaAdapter } from "./adapter";
import type { JolpicaHttpClient } from "./client";
import driverStandingsFixture from "./fixtures/driverStandings.2026.json";
import constructorStandingsFixture from "./fixtures/constructorStandings.2026.json";
import racesFixture from "./fixtures/races.2026.sample.json";
import seasonsFixture from "./fixtures/seasons.sample.json";
import type { JolpicaConstructorStanding, JolpicaDriverStanding, JolpicaRace, JolpicaSeason } from "./types";

/**
 * Fixture-backed fake client — tests never touch the live network, same
 * requirement and pattern as OpenF1Adapter's FixtureOpenF1Client
 * (packages/providers/f1/openf1/src/adapter.test.ts).
 */
class FixtureJolpicaClient implements JolpicaHttpClient {
  async getDriverStandings(): Promise<JolpicaDriverStanding[]> {
    return driverStandingsFixture.MRData.StandingsTable.StandingsLists[0]
      .DriverStandings as JolpicaDriverStanding[];
  }
  async getConstructorStandings(): Promise<JolpicaConstructorStanding[]> {
    return constructorStandingsFixture.MRData.StandingsTable.StandingsLists[0]
      .ConstructorStandings as JolpicaConstructorStanding[];
  }
  async getSeasons(): Promise<JolpicaSeason[]> {
    return seasonsFixture.MRData.SeasonTable.Seasons as JolpicaSeason[];
  }
  async getRaces(): Promise<JolpicaRace[]> {
    return racesFixture.MRData.RaceTable.Races as JolpicaRace[];
  }
}

// The reusable contract suite from packages/providers/core, run against this
// adapter exactly as required for every real adapter added to the registry.
sportsProviderContractTests(() => new JolpicaAdapter({ client: new FixtureJolpicaClient() }));

describe("JolpicaAdapter — F1-specific behavior, offline via FixtureJolpicaClient", () => {
  const makeAdapter = () => new JolpicaAdapter({ client: new FixtureJolpicaClient() });

  it("getCompetitions returns the same constant F1 championship OpenF1Adapter returns, without any HTTP call", async () => {
    const adapter = makeAdapter();
    const competitions = await adapter.getCompetitions();
    expect(competitions).toEqual([
      {
        id: "f1-world-championship",
        sportId: "f1",
        slug: "f1-world-championship",
        name: "FIA Formula One World Championship",
        type: "championship",
      },
    ]);
  });

  it("getStandings combines real driver and constructor standings into one array, scoped to the requested season", async () => {
    const adapter = makeAdapter();
    const standings = await adapter.getStandings({ seasonId: "f1-season-2026" });
    expect(standings.filter((s) => s.entityType === "player")).toHaveLength(22);
    expect(standings.filter((s) => s.entityType === "team")).toHaveLength(11);
    expect(standings.every((s) => s.seasonId === "f1-season-2026")).toBe(true);
  });

  it("getStandings driver entries use f1-driver-{number} ids matching OpenF1Adapter's own scheme", async () => {
    const adapter = makeAdapter();
    const standings = await adapter.getStandings({ seasonId: "f1-season-2026" });
    const antonelli = standings.find((s) => s.entityId === "f1-driver-12");
    expect(antonelli).toBeDefined();
    expect(antonelli?.position).toBe(1);
    expect(antonelli?.points).toBe(219);
  });

  it("getFixtures normalizes the real 2026 sample races", async () => {
    const adapter = makeAdapter();
    const fixtures = await adapter.getFixtures({ competitionId: "f1-world-championship", seasonId: "f1-season-2026" });
    expect(fixtures.map((f) => f.name)).toEqual(["Australian Grand Prix", "Chinese Grand Prix"]);
  });

  it("getSessions resolves a Jolpica-scoped fixture id back to its real sessions", async () => {
    const adapter = makeAdapter();
    const sessions = await adapter.getSessions({ fixtureId: "f1-jolpica-race-2026-1" });
    expect(sessions.map((s) => s.type)).toEqual(["FP1", "FP2", "FP3", "QUALIFYING", "RACE"]);
  });

  it("getSessions returns [] for a round that doesn't exist in the schedule, rather than throwing", async () => {
    const adapter = makeAdapter();
    const sessions = await adapter.getSessions({ fixtureId: "f1-jolpica-race-2026-99" });
    expect(sessions).toEqual([]);
  });

  it("getVenues deduplicates and normalizes real circuits", async () => {
    const adapter = makeAdapter();
    const venues = await adapter.getVenues({ seasonId: "f1-season-2026" });
    expect(venues.map((v) => v.id)).toEqual(["f1-jolpica-circuit-albert_park", "f1-jolpica-circuit-shanghai"]);
  });

  it("getTeams derives the real 11-constructor grid from constructor standings, correctly mapped", async () => {
    const adapter = makeAdapter();
    const teams = await adapter.getTeams();
    expect(teams).toHaveLength(11);
    expect(teams.find((t) => t.id === "f1-team-racing-bulls")).toBeDefined();
    expect(teams.find((t) => t.id === "f1-team-red-bull-racing")).toBeDefined();
  });

  it("getPlayers derives real drivers from driver standings, filterable by teamId", async () => {
    const adapter = makeAdapter();
    const mercedesDrivers = await adapter.getPlayers({ teamId: "f1-team-mercedes" });
    expect(mercedesDrivers.every((p) => p.teamId === "f1-team-mercedes")).toBe(true);
    expect(mercedesDrivers.find((p) => p.shortName === "ANT")).toBeDefined();
  });

  it("pollLiveEvents always returns [] — Jolpica has no live data, OpenF1 remains the sole live-event source", async () => {
    const adapter = makeAdapter();
    const events = await adapter.pollLiveEvents({ sessionId: "any-session" });
    expect(events).toEqual([]);
  });
});

describe("JolpicaAdapter — error handling passthrough", () => {
  it("propagates a client error from getStandings rather than swallowing it", async () => {
    const failingClient: JolpicaHttpClient = {
      getDriverStandings: async () => {
        throw new Error("simulated network failure");
      },
      getConstructorStandings: async () => [],
      getSeasons: async () => [],
      getRaces: async () => [],
    };
    const adapter = new JolpicaAdapter({ client: failingClient });
    await expect(adapter.getStandings({ seasonId: "f1-season-2026" })).rejects.toThrow("simulated network failure");
  });

  it("invokes the request logger with failure details on a client error, without ever including request params", async () => {
    const logs: Array<{ method: string; ok: boolean }> = [];
    const failingClient: JolpicaHttpClient = {
      getDriverStandings: async () => {
        throw new Error("simulated failure");
      },
      getConstructorStandings: async () => [],
      getSeasons: async () => [],
      getRaces: async () => [],
    };
    const adapter = new JolpicaAdapter({
      client: failingClient,
      onRequest: (log) => logs.push({ method: log.method, ok: log.ok }),
    });
    await expect(adapter.getStandings({ seasonId: "f1-season-2026" })).rejects.toThrow();
    expect(logs).toEqual([{ method: "getStandings", ok: false }]);
  });
});
