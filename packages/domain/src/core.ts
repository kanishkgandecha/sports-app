/**
 * Core, sport-agnostic domain model.
 *
 * Terminology (see ARCHITECTURE.md §5):
 *   Competition -> Season -> Fixture -> Session -> LiveEvent
 *
 * A Fixture is the schedulable, followable thing (a Grand Prix weekend, a
 * football match, a cricket match, an esports series). A Session is the
 * sport-specific unit that actually carries live state (an F1 practice
 * session, an esports map, a football match's single session). Football and
 * cricket usually collapse Fixture and Session into one; F1 and esports do
 * not. Nothing here should be widened to force that collapse either way.
 */

export type SportSlug = "f1" | "cricket" | "football" | "esports";

export type SportStatus = "live" | "beta" | "education-only";

export interface Sport {
  id: string;
  slug: SportSlug;
  name: string;
  status: SportStatus;
}

export type CompetitionType = "championship" | "league" | "tournament" | "cup";

export interface Competition {
  id: string;
  sportId: string;
  slug: string;
  name: string;
  type: CompetitionType;
}

export interface Season {
  id: string;
  competitionId: string;
  label: string;
  startDate: string;
  endDate: string;
}

export interface Venue {
  id: string;
  name: string;
  country: string;
  timezone: string;
}

export interface Team {
  id: string;
  sportId: string;
  name: string;
  slug: string;
  country: string | null;
  /** Brand/kit color, e.g. "#3671C6". Cross-sport — not F1-specific (see docs/CONTEXT.md §7.4.2). */
  colorHex: string | null;
}

export interface Player {
  id: string;
  sportId: string;
  teamId: string | null;
  name: string;
  role: string | null;
  /** Abbreviated display name/code, e.g. F1's 3-letter driver code "VER". Cross-sport (§7.4.3). */
  shortName: string | null;
  /** Athlete photo/headshot. Cross-sport (§7.4.3). */
  avatarUrl: string | null;
}

export type FixtureStatus = "scheduled" | "live" | "completed" | "postponed" | "cancelled";

/** The schedulable, followable unit. Not every sport's "match" maps 1:1 — see module docs. */
export interface Fixture {
  id: string;
  sportId: string;
  competitionId: string;
  seasonId: string;
  slug: string;
  name: string;
  status: FixtureStatus;
  startTime: string;
  venueId: string | null;
}

export type SessionStatus = "scheduled" | "live" | "completed" | "cancelled";

/** The sport-specific unit that carries live state within a Fixture. */
export interface Session {
  id: string;
  fixtureId: string;
  type: string;
  status: SessionStatus;
  startTime: string;
  endTime: string | null;
}

/**
 * Append-only stream of things that happened inside a Session.
 * `eventType` and `payload` are intentionally sport-specific — see
 * ARCHITECTURE.md §5 and the per-sport event vocabularies in the master
 * brief (§11). Never force every sport onto one payload shape.
 */
export interface LiveEvent<TPayload = Record<string, unknown>> {
  id: string;
  sportId: string;
  sessionId: string;
  eventType: string;
  timestamp: string;
  source: string;
  payload: TPayload;
}

export type StandingEntityType = "team" | "player";

export interface Standing {
  id: string;
  competitionId: string;
  seasonId: string;
  entityType: StandingEntityType;
  entityId: string;
  points: number;
  position: number;
  extra: Record<string, unknown>;
}

/** Freshness contract every session-shaped API response must carry (see ARCHITECTURE.md §8). */
export type DataFreshness = "live" | "updated" | "delayed" | "offline";

export interface FreshnessInfo {
  state: DataFreshness;
  updatedAt: string;
}
