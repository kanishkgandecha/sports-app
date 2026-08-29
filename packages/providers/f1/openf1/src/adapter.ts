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
  f1,
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
  normalizeLapRecord,
  normalizePitStop,
  normalizeSessionClassification,
  normalizeStint,
  normalizeTyreStint,
  positionTimingPatch,
  sessionResultTimingPatch,
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
  OpenF1SessionResult,
  OpenF1Stint,
} from "./types";

export interface OpenF1HistoricalSessionDetail {
  teams: Team[];
  players: Player[];
  events: LiveEvent[];
  timingPatches: DriverTimingPatch[];
  classifications: f1.SessionClassification[];
  laps: f1.Lap[];
  stints: f1.TyreStint[];
}

export interface OpenF1HistoricalSessionAnalysis {
  classifications: f1.SessionClassification[];
  laps: f1.Lap[];
  stints: f1.TyreStint[];
}

/**
 * OpenF1-backed `SportsProvider` (Checkpoint 3 — see docs/CONTEXT.md §8;
 * `getVenues` added to the shared interface at Checkpoint 4 §9, resolving a
 * gap flagged but left open in Checkpoint 3).
 *
 * One capability the shared `SportsProvider` interface still doesn't
 * naturally fit, documented rather than silently worked around:
 * `getTeams`/`getPlayers` take no session/fixture scope, but OpenF1's roster
 * data is inherently session-scoped (a driver's team can change session to
 * session). This adapter approximates "current roster" by resolving the
 * session closest to now — documented, not a perfect fit, not changed this
 * checkpoint (see docs/CONTEXT.md §9 "Known limitations").
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
    const meetings = await this.timed("getSeasons", () => this.client.get<OpenF1Meeting>("/meetings"));
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

  async getFixtures(input: { competitionId: string; seasonId?: string; status?: FixtureStatus }): Promise<Fixture[]> {
    const year = input.seasonId ? yearFromSeasonId(input.seasonId) : new Date().getFullYear();
    const meetings = await this.timed("getFixtures", () => this.client.get<OpenF1Meeting>("/meetings", { year }));
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
   * One completed-session snapshot for the archive. Unlike `pollLiveEvents`,
   * this avoids position-stream replay and duplicate endpoint reads: final
   * classification comes from `/session_result`, while laps, pits, and race
   * control retain the useful historical event detail.
   */
  async getHistoricalSessionDetail(sessionId: string): Promise<OpenF1HistoricalSessionDetail> {
    const sessionKey = sessionKeyFromSessionId(sessionId);
    const [drivers, results, raceControl, laps, pits, stints] = await this.timed("getHistoricalSessionDetail", () =>
      Promise.all([
        this.client.get<OpenF1Driver>("/drivers", { session_key: sessionKey }),
        this.client.get<OpenF1SessionResult>("/session_result", { session_key: sessionKey }),
        this.client.get<OpenF1RaceControlMessage>("/race_control", { session_key: sessionKey }),
        this.client.get<OpenF1Lap>("/laps", { session_key: sessionKey }),
        this.client.get<OpenF1Pit>("/pit", { session_key: sessionKey }),
        this.client.get<OpenF1Stint>("/stints", { session_key: sessionKey }),
      ]),
    );

    const teams = [...new Map(drivers.map((driver) => [normalizeTeam(driver).id, normalizeTeam(driver)])).values()];
    const players = drivers.map(normalizePlayer);
    const events: LiveEvent[] = raceControl.map((message) => normalizeRaceControlEvent(message, { sessionId }));
    for (const lap of laps) {
      const event = normalizeLap(lap, { sessionId });
      if (event) events.push(event as unknown as LiveEvent);
    }
    for (const pit of pits) {
      const event = normalizePitStop(pit, { sessionId });
      if (event) events.push(event as unknown as LiveEvent);
    }
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const patches = new Map<string, DriverTimingPatch>();
    const merge = (patch: DriverTimingPatch) => {
      patches.set(patch.driverId, { ...patches.get(patch.driverId), ...patch });
    };
    results.forEach((result) => merge(sessionResultTimingPatch(result, sessionId)));

    const lapsByDriver = new Map<number, OpenF1Lap[]>();
    for (const lap of laps) {
      const list = lapsByDriver.get(lap.driver_number) ?? [];
      list.push(lap);
      lapsByDriver.set(lap.driver_number, list);
    }
    for (const driverLaps of lapsByDriver.values()) {
      const latest = driverLaps.reduce((candidate, lap) => (lap.lap_number > candidate.lap_number ? lap : candidate));
      const completed = driverLaps.filter((lap) => lap.lap_duration !== null);
      const best = completed.reduce<OpenF1Lap | undefined>(
        (candidate, lap) => (!candidate || lap.lap_duration! < candidate.lap_duration! ? lap : candidate),
        undefined,
      );
      merge({ ...lapTimingPatch(latest, sessionId), ...(best && { bestLapTime: best.lap_duration }) });
    }

    const finalStints = new Map<number, OpenF1Stint>();
    for (const stint of stints) {
      const current = finalStints.get(stint.driver_number);
      if (!current || stint.stint_number > current.stint_number) finalStints.set(stint.driver_number, stint);
    }
    finalStints.forEach((stint) => merge(normalizeStint(stint, sessionId)));

    return {
      teams,
      players,
      events,
      timingPatches: [...patches.values()],
      classifications: results.map((result) => normalizeSessionClassification(result, sessionId)),
      laps: laps.map((lap) => normalizeLapRecord(lap, sessionId)),
      stints: stints
        .map((stint) => normalizeTyreStint(stint, sessionId))
        .filter((stint): stint is f1.TyreStint => stint !== null),
    };
  }

  /**
   * Focused historical-analysis snapshot. The rolling Phase 2 backfill does
   * not need to re-download drivers, race control, or pit events already
   * persisted by the detail importer, so this deliberately reads only the
   * three normalized analysis sources.
   */
  async getHistoricalSessionAnalysis(sessionId: string): Promise<OpenF1HistoricalSessionAnalysis> {
    const sessionKey = sessionKeyFromSessionId(sessionId);
    const [results, laps, stints] = await this.timed("getHistoricalSessionAnalysis", () =>
      Promise.all([
        this.client.get<OpenF1SessionResult>("/session_result", { session_key: sessionKey }),
        this.client.get<OpenF1Lap>("/laps", { session_key: sessionKey }),
        this.client.get<OpenF1Stint>("/stints", { session_key: sessionKey }),
      ]),
    );

    return {
      classifications: results.map((result) => normalizeSessionClassification(result, sessionId)),
      laps: laps.map((lap) => normalizeLapRecord(lap, sessionId)),
      stints: stints
        .map((stint) => normalizeTyreStint(stint, sessionId))
        .filter((stint): stint is f1.TyreStint => stint !== null),
    };
  }

  /**
   * Ingestion has to call this *before* `getFixtures` when bootstrapping, so
   * `Fixture.venueId` has a real row to reference (FK) — this adapter can't
   * decide that ordering on its own, only expose the data.
   */
  async getVenues(input?: { competitionId?: string; seasonId?: string }): Promise<Venue[]> {
    const year = input?.seasonId ? yearFromSeasonId(input.seasonId) : new Date().getFullYear();
    const meetings = await this.timed("getVenues", () => this.client.get<OpenF1Meeting>("/meetings", { year }));
    const seen = new Set<string>();
    return meetings.map(normalizeVenue).filter((venue) => (seen.has(venue.id) ? false : (seen.add(venue.id), true)));
  }

  /** TTL cache for `getReferenceDrivers()` — see that method's doc comment. */
  private referenceDriversCache: { fetchedAt: number; drivers: OpenF1Driver[] } | undefined;
  private static readonly REFERENCE_DRIVERS_TTL_MS = 5 * 60 * 1000;

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
    return pool.reduce((latest, s) => (new Date(s.date_start) > new Date(latest.date_start) ? s : latest));
  }

  /**
   * `getTeams` and `getPlayers` both ultimately want "drivers in the
   * reference session" — originally each called `resolveReferenceSession`
   * and fetched `/drivers` independently, doubling the same 3 requests
   * (`/meetings`, `/sessions`, `/drivers`). A live smoke test at Checkpoint
   * 4 caught this doing real damage: called back-to-back with no pacing
   * right after the (correctly paced) calendar bootstrap loop, the doubled
   * burst tipped a bootstrap run over OpenF1's rate limit (docs/CONTEXT.md
   * §9). A short TTL cache both halves the request count and gives callers
   * that invoke `getTeams`/`getPlayers` close together (as bootstrap does)
   * a consistent roster snapshot instead of two independently-resolved ones.
   */
  private async getReferenceDrivers(): Promise<OpenF1Driver[]> {
    const now = Date.now();
    if (
      this.referenceDriversCache &&
      now - this.referenceDriversCache.fetchedAt < OpenF1Adapter.REFERENCE_DRIVERS_TTL_MS
    ) {
      return this.referenceDriversCache.drivers;
    }

    const session = await this.resolveReferenceSession();
    const drivers = session
      ? await this.client.get<OpenF1Driver>("/drivers", { session_key: session.session_key })
      : [];
    this.referenceDriversCache = { fetchedAt: now, drivers };
    return drivers;
  }

  async getTeams(_input?: { competitionId?: string }): Promise<Team[]> {
    const drivers = await this.timed("getTeams", () => this.getReferenceDrivers());
    const seen = new Set<string>();
    return drivers.map(normalizeTeam).filter((team) => (seen.has(team.id) ? false : (seen.add(team.id), true)));
  }

  async getPlayers(input?: { teamId?: string }): Promise<Player[]> {
    const drivers = await this.timed("getPlayers", () => this.getReferenceDrivers());
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
   * Current-state timing patches (laps/intervals/stints/position), separate
   * from `pollLiveEvents` because intervals and stints don't have a
   * dedicated LiveEvent type (Checkpoint 2 §7.3) — they only ever feed
   * `DriverTiming`, never the append-only stream. Position is fetched here
   * too even though `pollLiveEvents` also reads it (for POSITION_CHANGE
   * diffing) — `DriverTiming.position` is required and non-null, so
   * ingestion needs the *current* value regardless of whether it changed
   * this tick, which `pollLiveEvents`'s diff-only view can't provide alone.
   * Known, accepted duplicate fetch — see docs/CONTEXT.md §9's ingestion
   * limitations note, not fixed this checkpoint to avoid widening the
   * adapter's public surface further right now.
   */
  async getDriverTimingPatches(sessionId: string, since?: string): Promise<DriverTimingPatch[]> {
    const sessionKey = sessionKeyFromSessionId(sessionId);
    const dateFilter = since ? { "date>": since } : {};
    const lapDateFilter = since ? { "date_start>": since } : {};

    const [laps, intervals, stints, positions] = await this.timed("getDriverTimingPatches", () =>
      Promise.all([
        this.client.get<OpenF1Lap>("/laps", { session_key: sessionKey, ...lapDateFilter }),
        this.client.get<OpenF1Interval>("/intervals", { session_key: sessionKey, ...dateFilter }),
        this.client.get<OpenF1Stint>("/stints", { session_key: sessionKey }),
        this.client.get<OpenF1Position>("/position", { session_key: sessionKey, ...dateFilter }),
      ]),
    );

    const patches: DriverTimingPatch[] = [
      ...positions.map((position) => positionTimingPatch(position, sessionId)),
      ...laps.map((lap) => lapTimingPatch(lap, sessionId)),
      ...intervals.map((interval) => intervalTimingPatch(interval, sessionId)),
      ...stints.map((stint) => normalizeStint(stint, sessionId)),
    ];
    return patches;
  }
}
