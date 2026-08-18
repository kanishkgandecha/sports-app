import type {
  Competition,
  Fixture,
  FixtureStatus,
  LiveEvent,
  Player,
  Season,
  Session,
  Standing,
  Team,
} from "@sports/domain";

/**
 * The one interface every provider adapter implements, regardless of sport
 * or vendor (ARCHITECTURE.md §3/§4). Application code — the ingestion
 * worker, the API — depends only on this. Swapping OpenF1 for Sportmonks,
 * or adding a second cricket vendor, is a new file implementing this
 * interface, never a change to the caller.
 */
export interface SportsProvider {
  /** Stable id for this (sport, vendor) pair, e.g. "openf1", "sportmonks-cricket". */
  readonly id: string;
  readonly sportId: string;

  getCompetitions(): Promise<Competition[]>;
  getSeasons(input: { competitionId: string }): Promise<Season[]>;
  getFixtures(input: {
    competitionId: string;
    seasonId?: string;
    status?: FixtureStatus;
  }): Promise<Fixture[]>;
  getSessions(input: { fixtureId: string }): Promise<Session[]>;
  getTeams(input?: { competitionId?: string }): Promise<Team[]>;
  getPlayers(input?: { teamId?: string }): Promise<Player[]>;
  getStandings(input: { seasonId: string }): Promise<Standing[]>;

  /**
   * Pull live events for a session that occurred since `since` (an opaque
   * cursor this adapter returns via each event's `id`/`timestamp`).
   *
   * This is the one method every adapter must support even if the vendor's
   * own transport is push-based (websocket/MQTT) — a push-style adapter
   * implements this as a thin buffer drain, so the ingestion worker's
   * polling loop (ARCHITECTURE.md §4, "real-time delivery") never needs to
   * know which transport a given vendor actually uses.
   */
  pollLiveEvents(input: { sessionId: string; since?: string }): Promise<LiveEvent[]>;
}

export interface ProviderRequestLog {
  providerId: string;
  method: string;
  requestedAt: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}
