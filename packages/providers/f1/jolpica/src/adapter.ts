import type {
  Competition,
  Fixture,
  FixtureStatus,
  LiveEvent,
  Player,
  Season,
  Standing,
  Team,
  Venue,
} from "@sports/domain";
import { BaseProviderAdapter, type RequestLogger, type SportsProvider } from "@sports/providers-core";
import type { Session } from "@sports/domain";
import { JolpicaFetchClient, type JolpicaHttpClient } from "./client";
import { F1_COMPETITION, F1_SPORT_ID, buildSeasonId, fixtureRefFromId, yearFromSeasonId } from "./reference";
import { normalizeConstructorStanding, normalizeDriverStanding } from "./normalize/standing";
import { normalizeRace, normalizeRaceSessions, normalizeVenue } from "./normalize/race";
import { normalizePlayerFromStanding, normalizeTeamFromStanding } from "./normalize/roster";

/**
 * Jolpica-F1-backed `SportsProvider` (Checkpoint 6 — docs/CONTEXT.md
 * Checkpoint 6 §4 "Provider decision"). Added specifically as a
 * standings/reference-data source — `getStandings` is the real focus of
 * this adapter and the only method the rest of the application actually
 * calls (see apps/api/src/routes/f1.ts's standings endpoints).
 *
 * OpenF1 remains the F1 *live-data* provider (fixtures, sessions, timing,
 * race control) and is NOT replaced by this adapter. `getFixtures`/
 * `getSessions`/`getTeams`/`getPlayers`/`getVenues` are implemented here for
 * `SportsProvider` interface completeness and contract-test coverage (see
 * ./adapter.test.ts running the shared `sportsProviderContractTests`), using
 * Jolpica-scoped ids that deliberately do NOT match OpenF1's — see
 * reference.ts's doc comment. `pollLiveEvents` always returns `[]`: Jolpica
 * has no live/timing data at all.
 */
export class JolpicaAdapter extends BaseProviderAdapter implements SportsProvider {
  readonly id = "jolpica";
  readonly sportId = F1_SPORT_ID;

  private readonly client: JolpicaHttpClient;

  constructor(options: { client?: JolpicaHttpClient; onRequest?: RequestLogger } = {}) {
    super(options.onRequest);
    this.client = options.client ?? new JolpicaFetchClient();
  }

  async getCompetitions(): Promise<Competition[]> {
    return [F1_COMPETITION];
  }

  /**
   * Jolpica's `/seasons/` endpoint gives only `{season, url}` — no date
   * range, unlike OpenF1's `/meetings` (which this adapter's sibling derives
   * real start/end dates from). Approximated as the calendar year rather
   * than fetched per-season (77 seasons x 1 races-request each would be a
   * disproportionate cost for a method the application doesn't actually
   * call — see the class doc comment). Documented limitation, not silently
   * guessed — see docs/CONTEXT.md Checkpoint 6 §10.
   */
  async getSeasons(_input: { competitionId: string }): Promise<Season[]> {
    const seasons = await this.timed("getSeasons", () => this.client.getSeasons({ limit: 100 }));
    return seasons
      .map((s) => Number(s.season))
      .filter((year) => Number.isFinite(year))
      .map((year) => ({
        id: buildSeasonId(year),
        competitionId: F1_COMPETITION.id,
        label: String(year),
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
      }));
  }

  async getFixtures(input: {
    competitionId: string;
    seasonId?: string;
    status?: FixtureStatus;
  }): Promise<Fixture[]> {
    const year = input.seasonId ? yearFromSeasonId(input.seasonId) : new Date().getFullYear();
    const races = await this.timed("getFixtures", () => this.client.getRaces(year));
    const fixtures = races.map((race) =>
      normalizeRace(race, { competitionId: F1_COMPETITION.id, seasonId: buildSeasonId(year) }),
    );
    return input.status ? fixtures.filter((f) => f.status === input.status) : fixtures;
  }

  async getSessions(input: { fixtureId: string }): Promise<Session[]> {
    const { year, round } = fixtureRefFromId(input.fixtureId);
    const races = await this.timed("getSessions", () => this.client.getRaces(year));
    const race = races.find((r) => r.round === round);
    if (!race) return [];
    return normalizeRaceSessions(race, { fixtureId: input.fixtureId });
  }

  async getVenues(input?: { competitionId?: string; seasonId?: string }): Promise<Venue[]> {
    const year = input?.seasonId ? yearFromSeasonId(input.seasonId) : new Date().getFullYear();
    const races = await this.timed("getVenues", () => this.client.getRaces(year));
    const seen = new Set<string>();
    return races
      .map(normalizeVenue)
      .filter((venue) => (seen.has(venue.id) ? false : (seen.add(venue.id), true)));
  }

  /** Roster approximation from the current season's constructor standings — see normalize/roster.ts's doc comment. */
  async getTeams(_input?: { competitionId?: string }): Promise<Team[]> {
    const year = new Date().getFullYear();
    const standings = await this.timed("getTeams", () => this.client.getConstructorStandings(year));
    const seen = new Set<string>();
    return standings
      .map(normalizeTeamFromStanding)
      .filter((team) => (seen.has(team.id) ? false : (seen.add(team.id), true)));
  }

  /** Roster approximation from the current season's driver standings — see normalize/roster.ts's doc comment. */
  async getPlayers(input?: { teamId?: string }): Promise<Player[]> {
    const year = new Date().getFullYear();
    const standings = await this.timed("getPlayers", () => this.client.getDriverStandings(year));
    const players = standings
      .map(normalizePlayerFromStanding)
      .filter((p): p is Player => p !== undefined);
    return input?.teamId ? players.filter((p) => p.teamId === input.teamId) : players;
  }

  /**
   * The reason this adapter exists — see the class doc comment. Fetches
   * both driver and constructor standings for the season and normalizes
   * them into one combined `Standing[]`, exactly like OpenF1Adapter's
   * `getStandings` combines drivers_championship + teams_championship.
   */
  async getStandings(input: { seasonId: string }): Promise<Standing[]> {
    const year = yearFromSeasonId(input.seasonId);
    const [drivers, constructors] = await this.timed("getStandings", () =>
      Promise.all([this.client.getDriverStandings(year), this.client.getConstructorStandings(year)]),
    );

    const driverStandings = drivers
      .map((entry) => normalizeDriverStanding(entry, { competitionId: F1_COMPETITION.id, year }))
      .filter((s): s is Standing => s !== undefined);
    const constructorStandings = constructors.map((entry) =>
      normalizeConstructorStanding(entry, { competitionId: F1_COMPETITION.id, year }),
    );

    return [...driverStandings, ...constructorStandings];
  }

  /** Jolpica has no live/timing data at all — OpenF1 is the sole live-event source (class doc comment). Always returns `[]`, never throws, so this adapter satisfies the shared `SportsProvider` contract test's "polls live events without throwing" expectation honestly rather than by accident. */
  async pollLiveEvents(_input: { sessionId: string; since?: string }): Promise<LiveEvent[]> {
    return [];
  }
}
