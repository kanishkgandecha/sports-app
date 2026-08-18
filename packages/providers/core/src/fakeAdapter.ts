import type {
  Competition,
  Fixture,
  LiveEvent,
  Player,
  Season,
  Session,
  Standing,
  Team,
} from "@sports/domain";
import type { SportsProvider } from "./types";

/**
 * Deliberately not a sport implementation. This adapter exists to prove the
 * ingestion → Postgres LISTEN/NOTIFY → SSE pipeline end to end before any
 * real vendor is wired in (ARCHITECTURE.md §7, step 6 / Phase 0 exit
 * criterion). It implements the real `SportsProvider` interface so the
 * ingestion worker and API never need a special code path for "fake" data —
 * that's the point of the abstraction.
 */
export class FakeSportsProvider implements SportsProvider {
  readonly id = "fake";
  readonly sportId = "synthetic";

  private readonly competition: Competition = {
    id: "synthetic-competition",
    sportId: this.sportId,
    slug: "synthetic-championship",
    name: "Synthetic Championship",
    type: "championship",
  };

  private readonly season: Season = {
    id: "synthetic-season",
    competitionId: this.competition.id,
    label: "2026",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
  };

  private readonly fixture: Fixture = {
    id: "synthetic-fixture",
    sportId: this.sportId,
    competitionId: this.competition.id,
    seasonId: this.season.id,
    slug: "synthetic-fixture",
    name: "Synthetic Fixture",
    status: "live",
    startTime: new Date().toISOString(),
    venueId: null,
  };

  private readonly session: Session = {
    id: "synthetic-session",
    fixtureId: this.fixture.id,
    type: "SYNTHETIC",
    status: "live",
    startTime: new Date().toISOString(),
    endTime: null,
  };

  private readonly team: Team = {
    id: "synthetic-team",
    sportId: this.sportId,
    name: "Synthetic Team",
    slug: "synthetic-team",
    country: null,
    colorHex: null,
  };

  private readonly player: Player = {
    id: "synthetic-player",
    sportId: this.sportId,
    teamId: this.team.id,
    name: "Synthetic Player",
    role: null,
    shortName: null,
    avatarUrl: null,
  };

  private sequence = 0;

  async getCompetitions(): Promise<Competition[]> {
    return [this.competition];
  }

  async getSeasons(): Promise<Season[]> {
    return [this.season];
  }

  async getFixtures(): Promise<Fixture[]> {
    return [this.fixture];
  }

  async getSessions(): Promise<Session[]> {
    return [this.session];
  }

  async getTeams(): Promise<Team[]> {
    return [this.team];
  }

  async getPlayers(): Promise<Player[]> {
    return [this.player];
  }

  async getStandings(): Promise<Standing[]> {
    return [
      {
        id: "synthetic-standing",
        competitionId: this.competition.id,
        seasonId: this.season.id,
        entityType: "team",
        entityId: this.team.id,
        points: this.sequence,
        position: 1,
        extra: {},
      },
    ];
  }

  /**
   * Emits one new synthetic event per call, ignoring `since` — pacing is
   * the caller's (the ingestion worker's poll interval's) responsibility,
   * not the adapter's. Alternates event types to prove the pipeline
   * survives more than one `eventType`/payload shape.
   */
  async pollLiveEvents(input: { sessionId: string }): Promise<LiveEvent[]> {
    this.sequence += 1;
    const isAlert = this.sequence % 5 === 0;
    const event: LiveEvent = {
      id: `synthetic-event-${this.sequence}`,
      sportId: this.sportId,
      sessionId: input.sessionId,
      eventType: isAlert ? "SYNTHETIC_ALERT" : "SYNTHETIC_TICK",
      timestamp: new Date().toISOString(),
      source: this.id,
      payload: isAlert
        ? { message: `Synthetic alert #${this.sequence}` }
        : { counter: this.sequence },
    };
    return [event];
  }
}
