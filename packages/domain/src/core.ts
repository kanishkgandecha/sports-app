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
  /**
   * Nullable since Cricket Checkpoint 1 (docs/CONTEXT.md) — the one core-
   * model change that checkpoint made, and the only field relaxed: F1's
   * OpenF1 always gives a real country per venue, but CricketData.org
   * gives only a single free-text "ground, city" string (e.g. "MA
   * Chidambaram Stadium, Chennai") with no separate country field at all —
   * verified against real match data, not assumed. Guessing a country
   * from a city name would need an external geo lookup this checkpoint
   * doesn't have and shouldn't fabricate; storing `null` is the honest
   * representation. F1 rows are unaffected — OpenF1Adapter still always
   * populates a real value.
   */
  country: string | null;
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
  updatedAt: string | null;
}

/**
 * One shared freshness computation, used by both the API (initial snapshot
 * on page load) and the web client (reactive, as SSE events arrive) — see
 * docs/CONTEXT.md §10. Having two independent implementations was the
 * failure mode this specifically avoids: "LIVE" must mean the same thing
 * everywhere it's shown, not "an SSE connection exists" (master brief §21).
 */
export const FRESHNESS_LIVE_THRESHOLD_MS = 20_000;
export const FRESHNESS_DELAYED_THRESHOLD_MS = 90_000;

/** Default safety cap for a session with no known end time — see docs/CONTEXT.md §9/§10. */
export const DEFAULT_MAX_SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

/**
 * Recomputes upcoming/live/completed from wall-clock time against
 * `startTime`/`endTime`, rather than trusting a stored `status` column that
 * only gets set once at bootstrap and never refreshed — the same reasoning
 * `apps/ingestion`'s active-session selection uses (docs/CONTEXT.md §9),
 * now shared so `apps/api`'s F1 routes compute session liveness the exact
 * same way instead of quietly re-deriving their own version of this logic.
 */
export function classifySessionLifecycle(
  session: { startTime: string; endTime: string | null },
  now: Date = new Date(),
  maxDurationMs: number = DEFAULT_MAX_SESSION_DURATION_MS,
): "upcoming" | "live" | "completed" {
  const start = new Date(session.startTime);
  const rawEnd = session.endTime ? new Date(session.endTime) : new Date(start.getTime() + maxDurationMs);
  const effectiveEnd = new Date(Math.min(rawEnd.getTime(), start.getTime() + maxDurationMs));

  if (now < start) return "upcoming";
  if (now > effectiveEnd) return "completed";
  return "live";
}

export function computeFreshness(input: {
  lastEventAt: string | null;
  isLive: boolean;
  now?: number;
}): FreshnessInfo {
  const now = input.now ?? Date.now();

  if (!input.isLive) {
    // Not a live session right now (scheduled or completed) — never claim
    // LIVE/DELAYED for something that isn't actually live.
    return { state: "offline", updatedAt: input.lastEventAt };
  }

  if (!input.lastEventAt) {
    // Live session, but nothing received yet — honest "we have nothing",
    // not a fabricated freshness state.
    return { state: "offline", updatedAt: null };
  }

  const ageMs = now - new Date(input.lastEventAt).getTime();
  if (ageMs <= FRESHNESS_LIVE_THRESHOLD_MS) {
    return { state: "live", updatedAt: input.lastEventAt };
  }
  if (ageMs <= FRESHNESS_DELAYED_THRESHOLD_MS) {
    return { state: "delayed", updatedAt: input.lastEventAt };
  }
  return { state: "offline", updatedAt: input.lastEventAt };
}
