import type { Fixture, FixtureStatus, Session, SessionStatus, Venue } from "@sports/domain";
import type { JolpicaRace } from "../types";
import { F1_SPORT_ID, buildFixtureId, buildSessionId, buildVenueId, slugify } from "../reference";

/**
 * Best-effort schedule normalization — NOT used by ingestion (OpenF1 remains
 * the sole fixture/session source of truth, see reference.ts's doc comment
 * on why these ids are intentionally Jolpica-scoped). Exists so
 * `getFixtures`/`getSessions` are real, tested implementations rather than
 * stubs, satisfying the shared `SportsProvider` contract test.
 */
export function normalizeVenue(race: JolpicaRace): Venue {
  return {
    id: buildVenueId(race.Circuit.circuitId),
    name: race.Circuit.circuitName,
    country: race.Circuit.Location.country,
    // Jolpica gives lat/long, not a timezone — unlike OpenF1's per-meeting
    // gmt_offset (packages/providers/f1/openf1/src/normalize/meeting.ts).
    // No timezone field to normalize from; honestly represented as unknown
    // rather than guessed from country.
    timezone: "UTC",
  };
}

function deriveFixtureStatus(race: JolpicaRace, now: Date): FixtureStatus {
  const raceStart = new Date(`${race.date}T${race.time ?? "00:00:00Z"}`);
  return now > raceStart ? "completed" : "scheduled";
}

export function normalizeRace(
  race: JolpicaRace,
  input: { competitionId: string; seasonId: string; now?: Date },
): Fixture {
  const year = Number(race.season);
  return {
    id: buildFixtureId(year, race.round),
    sportId: F1_SPORT_ID,
    competitionId: input.competitionId,
    seasonId: input.seasonId,
    slug: `${slugify(race.raceName)}-${race.season}-${race.round}`,
    name: race.raceName,
    status: deriveFixtureStatus(race, input.now ?? new Date()),
    startTime: `${race.date}T${race.time ?? "00:00:00Z"}`,
    venueId: buildVenueId(race.Circuit.circuitId),
  };
}

/** Jolpica's own sub-session labels, mapped to a Jolpica-scoped session id suffix. Deliberately not `F1SessionType` (f1.ts) — these ids/sessions are never joined against OpenF1's, see reference.ts. */
const SESSION_SLOTS: Array<{ key: keyof JolpicaRace; label: string; type: string }> = [
  { key: "FirstPractice", label: "FP1", type: "FP1" },
  { key: "SecondPractice", label: "FP2", type: "FP2" },
  { key: "ThirdPractice", label: "FP3", type: "FP3" },
  { key: "SprintQualifying", label: "Sprint Qualifying", type: "SPRINT_QUALIFYING" },
  { key: "Sprint", label: "Sprint", type: "SPRINT" },
  { key: "Qualifying", label: "Qualifying", type: "QUALIFYING" },
];

function deriveSessionStatus(startTime: string, now: Date): SessionStatus {
  return now > new Date(startTime) ? "completed" : "scheduled";
}

export function normalizeRaceSessions(race: JolpicaRace, input: { fixtureId: string; now?: Date }): Session[] {
  const year = Number(race.season);
  const now = input.now ?? new Date();
  const sessions: Session[] = [];

  for (const slot of SESSION_SLOTS) {
    const value = race[slot.key] as { date: string; time?: string } | undefined;
    if (!value) continue;
    const startTime = `${value.date}T${value.time ?? "00:00:00Z"}`;
    sessions.push({
      id: buildSessionId(year, race.round, slot.type),
      fixtureId: input.fixtureId,
      type: slot.type,
      status: deriveSessionStatus(startTime, now),
      startTime,
      endTime: null,
    });
  }

  // The race itself is always present.
  const raceStart = `${race.date}T${race.time ?? "00:00:00Z"}`;
  sessions.push({
    id: buildSessionId(year, race.round, "RACE"),
    fixtureId: input.fixtureId,
    type: "RACE",
    status: deriveSessionStatus(raceStart, now),
    startTime: raceStart,
    endTime: null,
  });

  return sessions;
}
