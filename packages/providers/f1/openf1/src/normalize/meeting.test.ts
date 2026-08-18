import { describe, expect, it } from "vitest";
import type { OpenF1Meeting } from "../types";
import { deriveFixtureStatus, deriveUtcOffset, normalizeMeeting, normalizeVenue } from "./meeting";
import meetings from "../fixtures/meetings.belgium2024.json";

const belgium2024 = (meetings as OpenF1Meeting[])[0];

describe("deriveUtcOffset", () => {
  it("formats a positive offset", () => {
    expect(deriveUtcOffset("02:00:00")).toBe("+02:00");
  });

  it("formats a negative offset", () => {
    expect(deriveUtcOffset("-05:00:00")).toBe("-05:00");
  });

  it("formats a zero offset", () => {
    expect(deriveUtcOffset("00:00:00")).toBe("+00:00");
  });
});

describe("normalizeVenue", () => {
  it("normalizes a real meeting into a Venue, using gmt_offset rather than a static lookup", () => {
    const venue = normalizeVenue(belgium2024);
    expect(venue).toEqual({
      id: "f1-circuit-7",
      name: "Spa-Francorchamps",
      country: "Belgium",
      timezone: "+02:00",
    });
  });
});

describe("deriveFixtureStatus", () => {
  it("marks a cancelled meeting as cancelled regardless of dates", () => {
    const status = deriveFixtureStatus(
      { ...belgium2024, is_cancelled: true },
      new Date(belgium2024.date_start),
    );
    expect(status).toBe("cancelled");
  });

  it("marks a future meeting as scheduled", () => {
    const status = deriveFixtureStatus(belgium2024, new Date("2020-01-01"));
    expect(status).toBe("scheduled");
  });

  it("marks a past meeting as completed", () => {
    const status = deriveFixtureStatus(belgium2024, new Date("2030-01-01"));
    expect(status).toBe("completed");
  });

  it("marks a meeting as live while now falls inside its date range", () => {
    const midpoint = new Date(
      (new Date(belgium2024.date_start).getTime() + new Date(belgium2024.date_end).getTime()) / 2,
    );
    expect(deriveFixtureStatus(belgium2024, midpoint)).toBe("live");
  });
});

describe("normalizeMeeting", () => {
  it("normalizes the real Belgian GP 2024 meeting into a Fixture", () => {
    const fixture = normalizeMeeting(belgium2024, {
      competitionId: "f1-world-championship",
      seasonId: "f1-season-2024",
      now: new Date("2024-07-27"),
    });
    expect(fixture).toEqual({
      id: "f1-meeting-1242",
      sportId: "f1",
      competitionId: "f1-world-championship",
      seasonId: "f1-season-2024",
      slug: "belgian-grand-prix-2024-1242", // meeting_key suffix — see the doc comment on normalizeMeeting
      name: "Belgian Grand Prix",
      status: "live",
      startTime: belgium2024.date_start,
      venueId: "f1-circuit-7",
    });
  });
});
