import { describe, expect, it } from "vitest";
import { deriveFixtureStatus, deriveFormat, normalizeFixture, normalizeFixtureDetail, normalizeVenue } from "./fixture";
import type { CricketDataMatchSummary } from "../types";
import currentMatchesFixture from "../fixtures/currentMatches.json";
import awardedMatchInfo from "../fixtures/matchInfo.awarded.json";
import { buildTeamId } from "../reference";

const matches = currentMatchesFixture.data as CricketDataMatchSummary[];
const odiNoMatchType = matches.find((m) => m.id === "ca1a54c7-6c4d-4a33-a11d-5d025494ce8e")!;
const awardedMatch = matches.find((m) => m.id === "1fa3bd8a-4bac-4ebb-b022-aba8281467e3")!;
const inningsBreakMatch = matches.find((m) => m.id === "e9d200fb-3c43-4852-9c93-9160517d7b36")!;
const completedT20 = matches.find((m) => m.id === "793fd4ac-a2ee-4ca7-90ec-63743393d32e")!;

describe("deriveFormat — real matches", () => {
  it("reads matchType directly when present", () => {
    expect(deriveFormat(completedT20)).toBe("T20");
  });

  it("falls back to scanning the real match name when matchType is genuinely absent (verified real: the ODI had none)", () => {
    expect(odiNoMatchType.matchType).toBeUndefined();
    expect(odiNoMatchType.name).toContain("ODI");
    expect(deriveFormat(odiNoMatchType)).toBe("ODI");
  });

  it("returns null, never a guess, when neither matchType nor the name reveals a format", () => {
    const noFormatMatch: CricketDataMatchSummary = { ...completedT20, matchType: undefined, name: "Team A vs Team B, Final" };
    expect(deriveFormat(noFormatMatch)).toBeNull();
  });
});

describe("deriveFixtureStatus — real matches, including the matchEnded-is-unreliable case", () => {
  it("classifies a normal completed match as completed", () => {
    expect(deriveFixtureStatus(completedT20)).toBe("completed");
  });

  it("classifies the real awarded/forfeit match as completed even though matchEnded is false — the key evidence case", () => {
    expect(awardedMatch.matchEnded).toBe(false);
    expect(deriveFixtureStatus(awardedMatch)).toBe("completed");
  });

  it("classifies the real Innings-Break match as live", () => {
    expect(deriveFixtureStatus(inningsBreakMatch)).toBe("live");
  });

  it("classifies a match that hasn't started as scheduled", () => {
    const scheduled: CricketDataMatchSummary = { ...completedT20, matchStarted: false, matchEnded: false, status: "Match starts at 10:00" };
    expect(deriveFixtureStatus(scheduled)).toBe("scheduled");
  });

  it("classifies an abandoned match as postponed, not completed", () => {
    const abandoned: CricketDataMatchSummary = { ...completedT20, status: "Match abandoned due to rain" };
    expect(deriveFixtureStatus(abandoned)).toBe("postponed");
  });
});

describe("normalizeVenue — no country field in real data", () => {
  it("normalizes the real combined venue+city string without fabricating a country", () => {
    const venue = normalizeVenue(inningsBreakMatch);
    expect(venue).toEqual({
      id: "cricket-venue-ma-chidambaram-stadium-chennai",
      name: "MA Chidambaram Stadium, Chennai",
      country: null,
      timezone: "UTC",
    });
  });
});

describe("normalizeFixture — real matches", () => {
  it("normalizes a real match, deriving startTime from dateTimeGMT", () => {
    const fixture = normalizeFixture(inningsBreakMatch, { competitionId: "cricket-series-x", seasonId: "cricket-series-season-x" });
    expect(fixture.id).toBe("cricket-match-e9d200fb-3c43-4852-9c93-9160517d7b36");
    expect(fixture.status).toBe("live");
    expect(fixture.startTime).toBe("2026-08-18T14:00:00Z");
    expect(fixture.venueId).toBe("cricket-venue-ma-chidambaram-stadium-chennai");
  });
});

describe("normalizeFixtureDetail — real match_info detail (tossWinner/tossChoice only present here)", () => {
  const match = awardedMatchInfo.data as CricketDataMatchSummary;

  it("resolves the real toss winner to a team id and normalizes the lowercase tossChoice", () => {
    const detail = normalizeFixtureDetail(match, { resolveTeamId: buildTeamId });
    expect(match.tossWinner).toBe("tanzania women");
    expect(detail.tossWonByTeamId).toBe(buildTeamId("Tanzania Women"));
    expect(detail.tossDecision).toBe("BOWL");
  });

  it("carries the real free-text result only once the match is derived as completed", () => {
    const detail = normalizeFixtureDetail(match, { resolveTeamId: buildTeamId });
    expect(detail.result).toBe(match.status);
  });

  it("leaves tossWonByTeamId/tossDecision null when a list-summary match has no toss fields", () => {
    const detail = normalizeFixtureDetail(completedT20, { resolveTeamId: buildTeamId });
    expect(detail.tossWonByTeamId).toBeNull();
    expect(detail.tossDecision).toBeNull();
  });
});
