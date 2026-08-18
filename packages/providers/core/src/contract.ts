import { describe, expect, it } from "vitest";
import type { SportsProvider } from "./types";

/**
 * A reusable contract test: run this against every real adapter
 * (F1OpenF1Adapter, CricketSportmonksAdapter, ...) as it's built, so a
 * vendor swap can never silently drop a method the rest of the app relies
 * on. Exported from the package (not just a local test file) so other
 * provider packages can import and run it against their own adapter —
 * see packages/providers/f1/openf1/src/adapter.test.ts for the first real
 * usage.
 */
export function sportsProviderContractTests(makeProvider: () => SportsProvider) {
  describe("SportsProvider contract", () => {
    it("exposes stable id and sportId", () => {
      const provider = makeProvider();
      expect(provider.id).toBeTruthy();
      expect(provider.sportId).toBeTruthy();
    });

    it("resolves the competition -> season -> fixture -> session chain", async () => {
      const provider = makeProvider();
      const [competition] = await provider.getCompetitions();
      expect(competition).toBeDefined();

      const seasons = await provider.getSeasons({ competitionId: competition.id });
      expect(seasons.length).toBeGreaterThan(0);

      const fixtures = await provider.getFixtures({
        competitionId: competition.id,
        seasonId: seasons[0].id,
      });
      expect(fixtures.length).toBeGreaterThan(0);

      const sessions = await provider.getSessions({ fixtureId: fixtures[0].id });
      expect(sessions.length).toBeGreaterThan(0);
    });

    it("returns venues as an array (possibly empty) without throwing", async () => {
      const provider = makeProvider();
      const [competition] = await provider.getCompetitions();
      const [season] = await provider.getSeasons({ competitionId: competition.id });
      const venues = await provider.getVenues({ competitionId: competition.id, seasonId: season.id });
      expect(Array.isArray(venues)).toBe(true);
    });

    it("returns standings scoped to a season", async () => {
      const provider = makeProvider();
      const [competition] = await provider.getCompetitions();
      const [season] = await provider.getSeasons({ competitionId: competition.id });
      const standings = await provider.getStandings({ seasonId: season.id });
      expect(Array.isArray(standings)).toBe(true);
    });

    it("polls live events for a session without throwing", async () => {
      const provider = makeProvider();
      const events = await provider.pollLiveEvents({ sessionId: "any-session" });
      expect(Array.isArray(events)).toBe(true);
      for (const event of events) {
        expect(event.eventType).toBeTruthy();
        expect(event.timestamp).toBeTruthy();
      }
    });
  });
}
