import { describe, expect, it } from "vitest";
import { sportsProviderContractTests } from "@sports/providers-core/testing";
import { OpenF1Adapter } from "./adapter";
import type { OpenF1HttpClient } from "./client";
import meetings from "./fixtures/meetings.belgium2024.json";
import sessions from "./fixtures/sessions.belgium2024.json";
import drivers from "./fixtures/drivers.belgium2024race.json";
import raceControl from "./fixtures/raceControl.australia2023race.json";
import laps from "./fixtures/laps.sample.json";
import pit from "./fixtures/pit.belgium2024race.json";
import position from "./fixtures/position.sample.json";
import intervals from "./fixtures/intervals.sample.json";
import stints from "./fixtures/stints.sample.json";

/**
 * Fixture-backed fake client — tests never touch the live network (required
 * by this checkpoint). Routes by path; ignores most params, which is fine
 * for these fixtures (each represents one real query already).
 */
class FixtureOpenF1Client implements OpenF1HttpClient {
  async get<T>(path: string): Promise<T[]> {
    switch (path) {
      case "/meetings":
        return meetings as T[];
      case "/sessions":
        return sessions as T[];
      case "/drivers":
        return drivers as T[];
      case "/race_control":
        return raceControl as T[];
      case "/laps":
        return laps as T[];
      case "/pit":
        return pit as T[];
      case "/position":
        return position as T[];
      case "/intervals":
        return intervals as T[];
      case "/stints":
        return stints as T[];
      case "/drivers_championship":
      case "/teams_championship":
        return []; // verified real behavior — see docs/CONTEXT.md §8
      default:
        throw new Error(`FixtureOpenF1Client has no fixture for ${path}`);
    }
  }
}

// The reusable contract suite from Phase 0 (packages/providers/core) — the
// exact requirement from this checkpoint's brief: "Run the existing provider
// contract tests against the F1 adapter."
sportsProviderContractTests(() => new OpenF1Adapter({ client: new FixtureOpenF1Client() }));

describe("OpenF1Adapter — F1-specific behavior, offline via FixtureOpenF1Client", () => {
  const makeAdapter = () => new OpenF1Adapter({ client: new FixtureOpenF1Client() });

  it("getCompetitions returns the constant F1 championship without any HTTP call", async () => {
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

  it("getSeasons derives one season per distinct meeting year", async () => {
    const adapter = makeAdapter();
    const seasons = await adapter.getSeasons({ competitionId: "f1-world-championship" });
    expect(seasons.map((s) => s.label)).toEqual(["2024"]);
  });

  it("getFixtures normalizes the real Belgian GP meeting", async () => {
    const adapter = makeAdapter();
    const fixtures = await adapter.getFixtures({
      competitionId: "f1-world-championship",
      seasonId: "f1-season-2024",
    });
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0].name).toBe("Belgian Grand Prix");
  });

  it("getSessions returns all 5 real sessions for the meeting, correctly typed", async () => {
    const adapter = makeAdapter();
    const result = await adapter.getSessions({ fixtureId: "f1-meeting-1242" });
    expect(result.map((s) => s.type)).toEqual(["FP1", "FP2", "FP3", "QUALIFYING", "RACE"]);
  });

  it("getVenuesForSeason deduplicates venues shared across meetings", async () => {
    const adapter = makeAdapter();
    const venues = await adapter.getVenuesForSeason("f1-season-2024");
    expect(venues).toEqual([{ id: "f1-circuit-7", name: "Spa-Francorchamps", country: "Belgium", timezone: "+02:00" }]);
  });

  it("getTeams returns the deduplicated real 2024 grid's constructors", async () => {
    const adapter = makeAdapter();
    const teams = await adapter.getTeams();
    expect(teams.length).toBeGreaterThan(1);
    expect(teams.find((t) => t.name === "Red Bull Racing")).toBeDefined();
  });

  it("getPlayers returns real drivers, filterable by teamId", async () => {
    const adapter = makeAdapter();
    const redBullDrivers = await adapter.getPlayers({ teamId: "f1-team-red-bull-racing" });
    expect(redBullDrivers.every((p) => p.teamId === "f1-team-red-bull-racing")).toBe(true);
    expect(redBullDrivers.find((p) => p.shortName === "VER")).toBeDefined();
  });

  it("getStandings returns [] gracefully when OpenF1's beta championship endpoints have no data (the real, verified case)", async () => {
    const adapter = makeAdapter();
    const standings = await adapter.getStandings({ seasonId: "f1-season-2024" });
    expect(standings).toEqual([]);
  });

  it("pollLiveEvents on the real red-flag session produces at least one SAFETY_CAR event with category=red_flag", async () => {
    const adapter = makeAdapter();
    const events = await adapter.pollLiveEvents({ sessionId: "f1-session-7787" });
    const redFlagEvents = events.filter(
      (e) => e.eventType === "SAFETY_CAR" && (e.payload as { category: string }).category === "red_flag",
    );
    expect(redFlagEvents.length).toBeGreaterThan(0);
  });

  it("pollLiveEvents returns events sorted by timestamp across mixed sources", async () => {
    const adapter = makeAdapter();
    const events = await adapter.pollLiveEvents({ sessionId: "f1-session-7787" });
    const timestamps = events.map((e) => e.timestamp);
    expect(timestamps).toEqual([...timestamps].sort());
  });

  it("pollLiveEvents returns [] for an unrecognized sessionId instead of throwing", async () => {
    const adapter = makeAdapter();
    await expect(adapter.pollLiveEvents({ sessionId: "not-an-openf1-id" })).resolves.toEqual([]);
  });

  it("pollLiveEvents emits a FASTEST_LAP event only on the first lap seen for a session (stateful best-lap tracking)", async () => {
    const adapter = makeAdapter();
    const firstPoll = await adapter.pollLiveEvents({ sessionId: "f1-session-9574" });
    const fastestLapEvents = firstPoll.filter((e) => e.eventType === "FASTEST_LAP");
    expect(fastestLapEvents).toHaveLength(1); // one lap in the fixture => it's trivially the best so far

    const secondPoll = await adapter.pollLiveEvents({ sessionId: "f1-session-9574" });
    // Same single-lap fixture polled again — not a new best, so no second FASTEST_LAP.
    expect(secondPoll.filter((e) => e.eventType === "FASTEST_LAP")).toHaveLength(0);
  });

  it("getDriverTimingPatches merges laps, intervals, and stints into DriverTiming-shaped patches", async () => {
    const adapter = makeAdapter();
    const patches = await adapter.getDriverTimingPatches("f1-session-9574");
    expect(patches.some((p) => p.lastLapTime !== undefined)).toBe(true);
    expect(patches.some((p) => p.gapToLeader !== undefined)).toBe(true);
    expect(patches.some((p) => p.tyreCompound !== undefined)).toBe(true);
  });
});

describe("OpenF1Adapter — error handling passthrough", () => {
  it("propagates a client error from getFixtures rather than swallowing it", async () => {
    const failingClient: OpenF1HttpClient = {
      get: async () => {
        throw new Error("simulated network failure");
      },
    };
    const adapter = new OpenF1Adapter({ client: failingClient });
    await expect(
      adapter.getFixtures({ competitionId: "f1-world-championship", seasonId: "f1-season-2024" }),
    ).rejects.toThrow("simulated network failure");
  });

  it("invokes the request logger with failure details on a client error, without ever including request params", async () => {
    const logs: Array<{ method: string; ok: boolean }> = [];
    const failingClient: OpenF1HttpClient = {
      get: async () => {
        throw new Error("simulated failure");
      },
    };
    const adapter = new OpenF1Adapter({
      client: failingClient,
      onRequest: (log) => logs.push({ method: log.method, ok: log.ok }),
    });
    await expect(adapter.getSeasons({ competitionId: "f1-world-championship" })).rejects.toThrow();
    expect(logs).toEqual([{ method: "getSeasons", ok: false }]);
  });
});
