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
import { BaseProviderAdapter, type RequestLogger, type SportsProvider } from "@sports/providers-core";
import { OpenF1FetchClient, type OpenF1HttpClient } from "./client";
import {
  F1_COMPETITION,
  F1_SPORT_ID,
  buildSeasonId,
  meetingKeyFromFixtureId,
  sessionKeyFromSessionId,
  yearFromSeasonId,
} from "./reference";
import { normalizeMeeting, normalizeVenue } from "./normalize/meeting";
import { normalizeSession } from "./normalize/session";
import { normalizePlayer, normalizeTeam } from "./normalize/driver";
import { normalizeRaceControlEvent } from "./normalize/raceControl";
import {
  type DriverTimingPatch,
  diffPosition,
  intervalTimingPatch,
  lapTimingPatch,
  normalizeLap,
  normalizePitStop,
  normalizeStint,
} from "./normalize/timing";
import { normalizeChampionshipEntry } from "./normalize/standing";
import type {
  OpenF1ChampionshipEntry,
  OpenF1Driver,
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Meeting,
  OpenF1Pit,
  OpenF1Position,
  OpenF1RaceControlMessage,
  OpenF1Session,
  OpenF1Stint,
} from "./types";

/**
 * OpenF1-backed `SportsProvider` (Checkpoint 3 — see docs/CONTEXT.md §8).
 *
 * Two capabilities the shared `SportsProvider` interface doesn't naturally
 * fit, both documented in CONTEXT.md rather than silently worked around:
 *
 * 1. No `getVenues()` on the interface at all — Venue normalization exists
 *    here (`normalizeVenueFor`) but isn't reachable through the interface.
 *    Flagged for a decision at Checkpoint 5 (ingestion), not resolved here.
 * 2. `getTeams`/`getPlayers` take no session/fixture scope, but OpenF1's
 *    roster data is inherently session-scoped (a driver's team can change
 *    session to session). This adapter approximates "current roster" by
 *    resolving the session closest to now — documented, not a perfect fit.
 */
export class OpenF1Adapter extends BaseProviderAdapter implements SportsProvider {
  readonly id = "openf1";
  readonly sportId = F1_SPORT_ID;

  private readonly client: OpenF1HttpClient;

  /** sessionId -> (driverId -> last known position), for diffing OpenF1's position stream into POSITION_CHANGE events. */
  private readonly lastKnownPosition = new Map<string, Map<string, number>>();
  /** sessionId -> current session-best lap, for detecting FASTEST_LAP. */
  private readonly sessionBestLap = new Map<string, { driverId: string; seconds: number }>();

  constructor(options: { client?: OpenF1HttpClient; onRequest?: RequestLogger } = {}) {
    super(options.onRequest);
    this.client = options.client ?? new OpenF1FetchClient();
  }

  async getCompetitions(): Promise<Competition[]> {
    return [F1_COMPETITION];
  }

  async getSeasons(_input: { competitionId: string }): Promise<Season[]> {
    const meetings = await this.timed("getSeasons", () =>
      this.client.get<OpenF1Meeting>("/meetings"),
    );
    const byYear = new Map<number, OpenF1Meeting[]>();
    for (const meeting of meetings) {
      const list = byYear.get(meeting.year) ?? [];
      list.push(meeting);
      byYear.set(meeting.year, list);
    }
    return [...byYear.entries()].map(([year, yearMeetings]) => {
      const starts = yearMeetings.map((m) => m.date_start).sort();
      const ends = yearMeetings.map((m) => m.date_end).sort();
      return {
        id: buildSeasonId(year),
        competitionId: F1_COMPETITION.id,
        label: String(year),
        startDate: starts[0],
        endDate: ends[ends.length - 1],
      };
    });
  }

  async getFixtures(input: {
    competitionId: string;
    seasonId?: string;
    status?: FixtureStatus;
  }): Promise<Fixture[]> {
    const year = input.seasonId ? yearFromSeasonId(input.seasonId) : new Date().getFullYear();
    const meetings = await this.timed("getFixtures", () =>
      this.client.get<OpenF1Meeting>("/meetings", { year }),
    );
    const fixtures = meetings.map((meeting) =>
      normalizeMeeting(meeting, { competitionId: F1_COMPETITION.id, seasonId: buildSeasonId(year) }),
    );
    return input.status ? fixtures.filter((f) => f.status === input.status) : fixtures;
  }

  async getSessions(input: { fixtureId: string }): Promise<Session[]> {
    const meetingKey = meetingKeyFromFixtureId(input.fixtureId);
    const sessions = await this.timed("getSessions", () =>
      this.client.get<OpenF1Session>("/sessions", { meeting_key: meetingKey }),
    );
    return sessions.map((s) => normalizeSession(s, { fixtureId: input.fixtureId }));
  }

  /**
   * Venue normalization, reachable outside the `SportsProvider` interface
   * (see class doc). Ingestion (Checkpoint 5) needs to call this alongside
   * `getFixtures` to populate `Venue` rows before `Fixture.venueId` can
   * reference them — this adapter can't decide that ordering on its own.
   */
  async getVenuesForSeason(seasonId: string) {
    const year = yearFromSeasonId(seasonId);
    const meetings = await this.timed("getVenuesForSeason", () =>
      this.client.get<OpenF1Meeting>("/meetings", { year }),
    );
    const seen = new Set<string>();
    return meetings
      .map(normalizeVenue)
      .filter((venue) => (seen.has(venue.id) ? false : (seen.add(venue.id), true)));
  }

  /**
   * Approximation documented in the class doc: resolves the session whose
   * start time is closest to now (preferring one that's already started)
   * and reads the roster from it. Not a perfect fit for an interface that
   * has no session-scoping — see docs/CONTEXT.md §8.
   */
  private async resolveReferenceSession(): Promise<OpenF1Session | undefined> {
    const meetings = await this.client.get<OpenF1Meeting>("/meetings");
    if (meetings.length === 0) return undefined;
    const latestYear = Math.max(...meetings.map((m) => m.year));
    const sessions = await this.client.get<OpenF1Session>("/sessions", { year: latestYear });
    if (sessions.length === 0) return undefined;

    const now = Date.now();
    const started = sessions.filter((s) => new Date(s.date_start).getTime() <= now);
    const pool = started.length > 0 ? started : sessions;
    return pool.reduce((latest, s) =>
      new Date(s.date_start) > new Date(latest.date_start) ? s : latest,
    );
  }

  async getTeams(_input?: { competitionId?: string }): Promise<Team[]> {
    const session = await this.timed("getTeams", () => this.resolveReferenceSession());
    if (!session) return [];
    const drivers = await this.client.get<OpenF1Driver>("/drivers", { session_key: session.session_key });
    const seen = new Set<string>();
    return drivers
      .map(normalizeTeam)
      .filter((team) => (seen.has(team.id) ? false : (seen.add(team.id), true)));
  }

  async getPlayers(input?: { teamId?: string }): Promise<Player[]> {
    const session = await this.timed("getPlayers", () => this.resolveReferenceSession());
    if (!session) return [];
    const drivers = await this.client.get<OpenF1Driver>("/drivers", { session_key: session.session_key });
    const players = drivers.map(normalizePlayer);
    return input?.teamId ? players.filter((p) => p.teamId === input.teamId) : players;
  }

  /**
   * Best-effort, see docs/CONTEXT.md §7.3.6 and §8: OpenF1's championship
   * endpoints are beta and currently return no data for any query tried.
   * Jolpica-F1 is the intended primary source (not implemented this
   * checkpoint). Returns `[]`, not an error, when OpenF1 has nothing —
   * exactly the case observed during verification.
   */
  async getStandings(input: { seasonId: string }): Promise<Standing[]> {
    const year = yearFromSeasonId(input.seasonId);
    const sessions = await this.client.get<OpenF1Session>("/sessions", {
      year,
      session_name: "Race",
    });
    if (sessions.length === 0) return [];
    const latestRace = sessions.reduce((latest, s) =>
      new Date(s.date_start) > new Date(latest.date_start) ? s : latest,
    );

    const [drivers, teams] = await this.timed("getStandings", () =>
      Promise.all([
        this.client.get<OpenF1ChampionshipEntry>("/drivers_championship", {
          session_key: latestRace.session_key,
        }),
        this.client.get<OpenF1ChampionshipEntry>("/teams_championship", {
          session_key: latestRace.session_key,
        }),
      ]),
    );

    const params = { competitionId: F1_COMPETITION.id, seasonId: input.seasonId };
    return [...drivers, ...teams].map((entry) => normalizeChampionshipEntry(entry, params));
  }

  /**
   * Fetches race_control/laps/position/pit for one session, incrementally
   * since `since` where provided. Produces LiveEvents; the parallel
   * current-state view (`getDriverTimingPatches`) is a separate method since
   * not every source here has a dedicated LiveEvent type (Checkpoint 2 §7.3).
   */
  async pollLiveEvents(input: { sessionId: string; since?: string }): Promise<LiveEvent[]> {
    // A sessionId that isn't one of our own `f1-session-{key}` ids is a
    // malformed-input case, not a provider failure — return no events rather
    // than throwing, so a bad id can't take down a resilient polling loop.
    // (Also what makes this adapter satisfy the shared SportsProvider
    // contract test, which calls pollLiveEvents with an arbitrary string.)
    let sessionKey: number;
    try {
      sessionKey = sessionKeyFromSessionId(input.sessionId);
    } catch {
      console.warn(`[openf1] pollLiveEvents called with an unrecognized sessionId "${input.sessionId}"`);
      return [];
    }

    const dateFilter = input.since ? { "date>": input.since } : {};
    const lapDateFilter = input.since ? { "date_start>": input.since } : {};

    const [raceControl, laps, positions, pits] = await this.timed("pollLiveEvents", () =>
      Promise.all([
        this.client.get<OpenF1RaceControlMessage>("/race_control", {
          session_key: sessionKey,
          ...dateFilter,
        }),
        this.client.get<OpenF1Lap>("/laps", { session_key: sessionKey, ...lapDateFilter }),
        this.client.get<OpenF1Position>("/position", { session_key: sessionKey, ...dateFilter }),
        this.client.get<OpenF1Pit>("/pit", { session_key: sessionKey, ...dateFilter }),
      ]),
    );

    const events: LiveEvent[] = [];

    for (const msg of raceControl) {
      events.push(normalizeRaceControlEvent(msg, { sessionId: input.sessionId }));
    }

    for (const lap of laps) {
      const event = normalizeLap(lap, { sessionId: input.sessionId });
      if (!event) continue;
      // See the cast note in normalize/raceControl.ts — same LiveEvent<T> variance limitation.
      events.push(event as unknown as LiveEvent);

      const seconds = lap.lap_duration;
      if (seconds !== null) {
        const currentBest = this.sessionBestLap.get(input.sessionId);
        if (!currentBest || seconds < currentBest.seconds) {
          const driverId = event.payload.driverId;
          this.sessionBestLap.set(input.sessionId, { driverId, seconds });
          events.push({
            id: `openf1-fastest-lap-${sessionKey}-${lap.driver_number}-${lap.lap_number}`,
            sportId: F1_SPORT_ID,
            sessionId: input.sessionId,
            eventType: "FASTEST_LAP",
            timestamp: lap.date_start ?? event.timestamp,
            source: "openf1",
            payload: { driverId, lapTime: seconds.toFixed(3), lap: lap.lap_number },
          });
        }
      }
    }

    let positionMap = this.lastKnownPosition.get(input.sessionId);
    if (!positionMap) {
      positionMap = new Map();
      this.lastKnownPosition.set(input.sessionId, positionMap);
    }
    for (const position of positions) {
      const driverId = `f1-driver-${position.driver_number}`;
      const previous = positionMap.get(driverId);
      const event = diffPosition(previous, position, { sessionId: input.sessionId });
      if (event) events.push(event as unknown as LiveEvent);
      positionMap.set(driverId, position.position);
    }

    for (const pit of pits) {
      const event = normalizePitStop(pit, { sessionId: input.sessionId });
      if (event) events.push(event as unknown as LiveEvent);
    }

    // Chronological, not lexicographic: OpenF1 timestamps mix sub-second
    // precision inconsistently within the same session (e.g. race_control
    // gives "...T05:03:18+00:00" for some rows and "...T05:03:18.684000+
    // 00:00" for others) — a real quirk this adapter's own test fixtures
    // caught. String comparison sorts "+00:00" before ".684000+00:00" purely
    // because "+" < "." in ASCII, which is chronologically backwards.
    return events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  /**
   * Current-state timing patches (laps/intervals/stints), separate from
   * `pollLiveEvents` because intervals and stints don't have a dedicated
   * LiveEvent type (Checkpoint 2 §7.3) — they only ever feed `DriverTiming`,
   * never the append-only stream. Not wired into ingestion this checkpoint;
   * exposed for Checkpoint 5 to use.
   */
  async getDriverTimingPatches(sessionId: string, since?: string): Promise<DriverTimingPatch[]> {
    const sessionKey = sessionKeyFromSessionId(sessionId);
    const dateFilter = since ? { "date>": since } : {};
    const lapDateFilter = since ? { "date_start>": since } : {};

    const [laps, intervals, stints] = await this.timed("getDriverTimingPatches", () =>
      Promise.all([
        this.client.get<OpenF1Lap>("/laps", { session_key: sessionKey, ...lapDateFilter }),
        this.client.get<OpenF1Interval>("/intervals", { session_key: sessionKey, ...dateFilter }),
        this.client.get<OpenF1Stint>("/stints", { session_key: sessionKey }),
      ]),
    );

    const patches: DriverTimingPatch[] = [
      ...laps.map((lap) => lapTimingPatch(lap, sessionId)),
      ...intervals.map((interval) => intervalTimingPatch(interval, sessionId)),
      ...stints.map((stint) => normalizeStint(stint, sessionId)),
    ];
    return patches;
  }
}
