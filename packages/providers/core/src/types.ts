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
  Venue,
} from "@sports/domain";

/**
 * The one interface every provider adapter implements, regardless of sport
 * or vendor (ARCHITECTURE.md §3/§4). Application code — the ingestion
 * worker, the API — depends only on this. Swapping the F1 vendor means
 * implementing this interface, never changing the caller.
 */
export interface SportsProvider {
  /** Stable provider id, for example "openf1". */
  readonly id: string;
  readonly sportId: string;

  getCompetitions(): Promise<Competition[]>;
  getSeasons(input: { competitionId: string }): Promise<Season[]>;
  getFixtures(input: { competitionId: string; seasonId?: string; status?: FixtureStatus }): Promise<Fixture[]>;
  getSessions(input: { fixtureId: string }): Promise<Session[]>;
  getTeams(input?: { competitionId?: string }): Promise<Team[]>;
  getPlayers(input?: { teamId?: string }): Promise<Player[]>;
  getStandings(input: { seasonId: string }): Promise<Standing[]>;
  /**
   * Added at Checkpoint 4 (docs/CONTEXT.md §9) — flagged as a gap at
   * Checkpoint 3 (`OpenF1Adapter.getVenuesForSeason` existed only as a
   * bonus method outside this interface) and resolved once ingestion
   * actually needed it: a Fixture's `venueId` has to reference a real Venue
   * row, and only the provider knows what venues its fixtures use. Every
   * sport has venues eventually, not just F1 — this belongs on the shared
   * interface, not as an F1-specific escape hatch.
   */
  getVenues(input?: { competitionId?: string; seasonId?: string }): Promise<Venue[]>;

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
