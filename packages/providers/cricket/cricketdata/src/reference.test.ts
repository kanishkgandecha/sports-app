import { describe, expect, it } from "vitest";
import {
  buildCompetitionId,
  buildFixtureId,
  buildPlayerId,
  buildSeasonId,
  buildSessionId,
  buildTeamId,
  buildVenueId,
  fixtureRefFromId,
  sessionRefFromId,
  slugify,
} from "./reference";

describe("CricketData reference id builders", () => {
  it("builds a fixture id from the real match id (a UUID)", () => {
    expect(buildFixtureId("e9d200fb-3c43-4852-9c93-9160517d7b36")).toBe(
      "cricket-match-e9d200fb-3c43-4852-9c93-9160517d7b36",
    );
  });

  it("builds and parses fixture ids symmetrically", () => {
    const id = buildFixtureId("e9d200fb-3c43-4852-9c93-9160517d7b36");
    expect(fixtureRefFromId(id)).toBe("e9d200fb-3c43-4852-9c93-9160517d7b36");
  });

  it("builds a session id per innings (1-based)", () => {
    expect(buildSessionId("e9d200fb-3c43-4852-9c93-9160517d7b36", 1)).toBe(
      "cricket-match-e9d200fb-3c43-4852-9c93-9160517d7b36-innings-1",
    );
  });

  it("builds and parses session ids symmetrically", () => {
    const id = buildSessionId("e9d200fb-3c43-4852-9c93-9160517d7b36", 2);
    expect(sessionRefFromId(id)).toEqual({ matchId: "e9d200fb-3c43-4852-9c93-9160517d7b36", innings: 2 });
  });

  it("fixtureRefFromId rejects a session id rather than silently truncating it wrong", () => {
    const sessionId = buildSessionId("e9d200fb-3c43-4852-9c93-9160517d7b36", 1);
    expect(() => fixtureRefFromId(sessionId)).toThrow();
  });

  it("sessionRefFromId throws on a non-session id", () => {
    expect(() => sessionRefFromId("not-a-session-id")).toThrow();
  });

  it("builds a team id from a real team name", () => {
    expect(buildTeamId("Vida Kovai Kings")).toBe("cricket-team-vida-kovai-kings");
  });

  it("builds a player id directly from the provider's own stable player id", () => {
    expect(buildPlayerId("f6cc2815-be88-4e14-8951-ba9c86ad4572")).toBe(
      "cricket-player-f6cc2815-be88-4e14-8951-ba9c86ad4572",
    );
  });

  it("builds a venue id from the combined venue+city string", () => {
    expect(buildVenueId("MA Chidambaram Stadium, Chennai")).toBe("cricket-venue-ma-chidambaram-stadium-chennai");
  });

  it("builds competition/season ids from a real series id", () => {
    expect(buildCompetitionId("6c3c5876-5cfc-4490-9c8e-8ba90aec4323")).toBe(
      "cricket-series-6c3c5876-5cfc-4490-9c8e-8ba90aec4323",
    );
    expect(buildSeasonId("6c3c5876-5cfc-4490-9c8e-8ba90aec4323")).toBe(
      "cricket-series-season-6c3c5876-5cfc-4490-9c8e-8ba90aec4323",
    );
  });

  it("slugifies consistently, including real team names with punctuation", () => {
    expect(slugify("Trent Rockets Women")).toBe("trent-rockets-women");
  });
});
