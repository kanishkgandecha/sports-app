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
import type { cricket } from "@sports/domain";
import { BaseProviderAdapter, type RequestLogger, type SportsProvider } from "@sports/providers-core";
import { CricketDataFetchClient, type CricketDataHttpClient } from "./client";
import { CRICKET_SPORT_ID, buildCompetitionId, buildFixtureId, buildTeamId, fixtureRefFromId, sessionRefFromId } from "./reference";
import { normalizeCompetition, normalizeSeason } from "./normalize/competition";
import { deriveFixtureStatus, normalizeFixture, normalizeFixtureDetail, normalizeVenue } from "./normalize/fixture";
import { normalizeTeams } from "./normalize/team";
import { normalizePlayersFromScorecard } from "./normalize/player";
import { deriveInningsTeamOrder, normalizeInningsState, normalizeSessions } from "./normalize/innings";
import { diffInningsScore, diffMatchStatus, normalizeBalls } from "./normalize/events";
import type { CricketDataMatchSummary, CricketDataScoreEntry } from "./types";

/**
 * CricketData.org-backed `SportsProvider` (Cricket Checkpoint 1 —
 * docs/CONTEXT.md). The approved development provider (production:
 * Sportmonks Cricket, re-evaluated before that switch — see
 * docs/CONTEXT.md, Checkpoint 7 §7).
 *
 * **Real, verified constraints this adapter's design directly answers
 * to** (see types.ts/client.ts's doc comments for the evidence):
 *
 *  - **100 requests/day, confirmed via the API's own real response
 *    metadata** (`info.hitsLimit`), not just documentation. Every method
 *    here is written to make the fewest possible real calls — `getFixtures`/
 *    `getTeams`/`getVenues` all share a single `getCurrentMatches()` call
 *    where possible; `pollLiveEvents` makes exactly one `match_info` call
 *    per active session per tick, not three.
 *  - **No roster/squad endpoint reliably available** (`hasSquad: false` on
 *    every real match sampled) — `getPlayers` is necessarily best-effort,
 *    built from `match_scorecard` entries as they appear, not a clean
 *    upfront roster the way OpenF1's `/drivers` is for F1.
 *  - **`bbbEnabled: false` on every real match sampled** — true ball-by-
 *    ball (`match_bbb`) is real but was never available to verify a
 *    success shape against, and in practice this checkpoint's real data
 *    shows it's rarely (if ever) populated on the free tier. `pollLive
 *    Events`'s primary, always-real path is diffing `match_info`'s
 *    `score[]` across polls (`SCORE_UPDATE`/`WICKET`/`MATCH_STATUS` — the
 *    same "diff consecutive polls" technique `OpenF1Adapter` already uses
 *    for F1's position stream); `match_bbb` is attempted too and merged in
 *    when it actually succeeds, never assumed to.
 *  - **No points-table endpoint verified this checkpoint** (`match_points_
 *    table` exists as a real route — confirmed via a live auth-gated call
 *    — but its success shape was never captured, the same "real endpoint,
 *    unverified shape" situation as `match_bbb`, and lower priority given
 *    this checkpoint's actual deliverables). `getStandings` honestly
 *    returns `[]`, the same posture `OpenF1Adapter` took for F1's beta
 *    championship endpoints at Checkpoint 3 rather than fabricate a shape.
 */
export class CricketDataAdapter extends BaseProviderAdapter implements SportsProvider {
  readonly id = "cricketdata";
  readonly sportId = CRICKET_SPORT_ID;

  private readonly client: CricketDataHttpClient;
  /** How many distinct series to resolve real names for per `getCompetitions()`/`getSeasons()` call — bounds real network calls against the confirmed 100/day cap; a handful of series are live/recent at once in practice. */
  private readonly maxSeriesLookups: number;

  /** sessionId -> last-seen score snapshot, for diffing into SCORE_UPDATE/WICKET LiveEvents. */
  private readonly lastKnownScore = new Map<string, CricketDataScoreEntry>();
  /** fixtureId -> last-seen free-text status, for diffing into MATCH_STATUS LiveEvents. */
  private readonly lastKnownStatus = new Map<string, string>();

  /** TTL cache for `getCurrentMatches()` — see `getCachedCurrentMatches`'s doc comment. */
  private currentMatchesCache: { fetchedAt: number; response: Awaited<ReturnType<CricketDataHttpClient["getCurrentMatches"]>> } | undefined;
  private static readonly CURRENT_MATCHES_TTL_MS = 5 * 60 * 1000;

  constructor(options: { client?: CricketDataHttpClient; apiKey?: string; onRequest?: RequestLogger; maxSeriesLookups?: number } = {}) {
    super(options.onRequest);
    this.client = options.client ?? new CricketDataFetchClient({ apiKey: options.apiKey ?? "" });
    this.maxSeriesLookups = options.maxSeriesLookups ?? 5;
  }

  /**
   * `getCompetitions`/`getFixtures`/`getVenues`/`getTeams`/`getPlayers` all
   * ultimately want "the current matches list" — same doubling problem
   * OpenF1Adapter's `getReferenceDrivers` TTL cache (Checkpoint 4,
   * docs/CONTEXT.md §9) fixed for F1's `getTeams`/`getPlayers`, except far
   * more costly here: this provider's real, confirmed rate limit is
   * 100 requests/**day** (not OpenF1's ~200/hour — see client.ts's doc
   * comment), so an ingestion tick that calls several of these methods
   * back-to-back without this cache would burn through a meaningful
   * fraction of a whole day's quota on ONE tick. 5 minutes, not
   * OpenF1's-equivalent, because Cricket's ingestion cadence itself is
   * necessarily much coarser (apps/ingestion's Cricket config polls on
   * the order of tens of minutes, not seconds) — this only needs to
   * survive one tick's worth of same-cadence calls, not bridge a gap
   * between independent polling loops.
   */
  private async getCachedCurrentMatches(method: string) {
    const now = Date.now();
    if (this.currentMatchesCache && now - this.currentMatchesCache.fetchedAt < CricketDataAdapter.CURRENT_MATCHES_TTL_MS) {
      return this.currentMatchesCache.response;
    }
    const response = await this.timed(method, () => this.client.getCurrentMatches());
    this.currentMatchesCache = { fetchedAt: now, response };
    return response;
  }

  async getCompetitions(): Promise<Competition[]> {
    const matches = await this.getCachedCurrentMatches("getCompetitions");
    const seriesIds = [...new Set(matches.data.map((m) => m.series_id))].slice(0, this.maxSeriesLookups);
    const infos = await Promise.all(seriesIds.map((id) => this.client.getSeriesInfo(id).catch(() => undefined)));

    const competitions: Competition[] = [];
    for (const info of infos) {
      if (info?.status === "success" && info.data) competitions.push(normalizeCompetition(info.data.info));
    }
    return competitions;
  }

  async getSeasons(input: { competitionId: string }): Promise<Season[]> {
    const seriesId = seriesIdFromCompetitionId(input.competitionId);
    if (!seriesId) return [];
    const response = await this.timed("getSeasons", () => this.client.getSeriesInfo(seriesId));
    if (response.status !== "success" || !response.data) return [];
    return [normalizeSeason(response.data.info, { competitionId: input.competitionId })];
  }

  async getFixtures(input: { competitionId: string; seasonId?: string; status?: FixtureStatus }): Promise<Fixture[]> {
    const matches = await this.getCachedCurrentMatches("getFixtures");
    const seriesId = seriesIdFromCompetitionId(input.competitionId);
    const seasonId = input.seasonId ?? (seriesId ? `cricket-series-season-${seriesId}` : "");
    const scoped = seriesId ? matches.data.filter((m) => m.series_id === seriesId) : matches.data;
    const fixtures = scoped.map((m) => normalizeFixture(m, { competitionId: input.competitionId, seasonId }));
    return input.status ? fixtures.filter((f) => f.status === input.status) : fixtures;
  }

  async getSessions(input: { fixtureId: string }): Promise<Session[]> {
    // A malformed/unrecognized fixtureId is a bad-input case, not a
    // provider failure — same resilience posture as `pollLiveEvents`
    // below and OpenF1Adapter's own `sessionKeyFromSessionId` handling.
    let matchId: string;
    try {
      matchId = fixtureRefFromId(input.fixtureId);
    } catch {
      console.warn(`[cricketdata] getSessions called with an unrecognized fixtureId "${input.fixtureId}"`);
      return [];
    }

    // Resolve from the cached current-matches list first — real, sufficient
    // fields for `normalizeSessions` (score/status/dateTimeGMT) are already
    // on list summaries (verified — see types.ts), so a bulk caller (e.g.
    // ingestion bootstrapping N fixtures in a loop) never turns into N real
    // `match_info` calls just because `getSessions` is called once per
    // fixture. Only falls back to a fresh `match_info` call for a match
    // that genuinely isn't in the current list (already fallen out of
    // "current," or never was) — the accurate, toss-aware path
    // `pollLiveEvents`/`getInningsState` still get for a specific live
    // session.
    const cached = await this.getCachedCurrentMatches("getSessions");
    const fromCache = cached.data.find((m) => m.id === matchId);
    if (fromCache) return normalizeSessions(fromCache);

    const match = await this.fetchMatchInfo(matchId);
    if (!match) return [];
    return normalizeSessions(match);
  }

  async getVenues(_input?: { competitionId?: string; seasonId?: string }): Promise<Venue[]> {
    const matches = await this.getCachedCurrentMatches("getVenues");
    const seen = new Set<string>();
    return matches.data
      .map(normalizeVenue)
      .filter((venue) => (seen.has(venue.id) ? false : (seen.add(venue.id), true)));
  }

  async getTeams(input?: { competitionId?: string }): Promise<Team[]> {
    const matches = await this.getCachedCurrentMatches("getTeams");
    const seriesId = input?.competitionId ? seriesIdFromCompetitionId(input.competitionId) : undefined;
    const scoped = seriesId ? matches.data.filter((m) => m.series_id === seriesId) : matches.data;
    const seen = new Set<string>();
    return scoped
      .flatMap(normalizeTeams)
      .filter((team) => (seen.has(team.id) ? false : (seen.add(team.id), true)));
  }

  /**
   * Best-effort — see the class doc comment: no clean roster endpoint
   * exists. Resolves real, currently-live matches' scorecards (bounded by
   * `maxSeriesLookups`, the same real-call budget discipline as
   * `getCompetitions`) and normalizes whichever players actually appear in
   * them. `input.teamId` narrows to matches involving that team where
   * possible, to avoid fetching scorecards this call doesn't need.
   */
  async getPlayers(input?: { teamId?: string }): Promise<Player[]> {
    const matches = await this.getCachedCurrentMatches("getPlayers");
    const candidates = (input?.teamId ? matches.data.filter((m) => teamsInclude(m, input.teamId!)) : matches.data).slice(
      0,
      this.maxSeriesLookups,
    );

    const players: Player[] = [];
    for (const match of candidates) {
      const scorecard = await this.client.getMatchScorecard(match.id).catch(() => undefined);
      if (!scorecard || scorecard.status !== "success" || !scorecard.data) continue;
      const order = deriveInningsTeamOrder(match, buildTeamId);
      scorecard.data.scorecard.forEach((block, i) => {
        const teams = order[i];
        if (teams) players.push(...normalizePlayersFromScorecard(block, teams));
      });
    }
    const seen = new Set<string>();
    const deduped = players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    return input?.teamId ? deduped.filter((p) => p.teamId === input.teamId) : deduped;
  }

  /** Honestly `[]` — see the class doc comment: no points-table endpoint was verified this checkpoint, same posture OpenF1Adapter took for F1's unverified beta championship endpoints rather than fabricate a shape. */
  async getStandings(_input: { seasonId: string }): Promise<Standing[]> {
    return [];
  }

  /**
   * The core deliverable — see the class doc comment for the real,
   * verified reasons this diffs `match_info` rather than trusting
   * `match_bbb` alone. One `match_info` call per active session per tick
   * (not per-field), plus one best-effort `match_bbb` attempt (never
   * throws on failure — verified real failure mode).
   */
  async pollLiveEvents(input: { sessionId: string; since?: string }): Promise<LiveEvent[]> {
    let ref: { matchId: string; innings: number };
    try {
      ref = sessionRefFromId(input.sessionId);
    } catch {
      console.warn(`[cricketdata] pollLiveEvents called with an unrecognized sessionId "${input.sessionId}"`);
      return [];
    }

    const match = await this.fetchMatchInfo(ref.matchId, "pollLiveEvents");
    if (!match) return [];

    const fixtureId = buildFixtureId(ref.matchId);
    const entry = match.score?.[ref.innings - 1];
    const timestamp = new Date().toISOString();
    const events: LiveEvent[] = [];

    if (entry) {
      const previous = this.lastKnownScore.get(input.sessionId);
      events.push(...diffInningsScore(previous, entry, { sessionId: input.sessionId, timestamp, dismissalText: null }));
      this.lastKnownScore.set(input.sessionId, entry);
    }

    const previousStatus = this.lastKnownStatus.get(fixtureId);
    events.push(...diffMatchStatus(previousStatus, match, { fixtureId, sessionId: input.sessionId, timestamp }));
    this.lastKnownStatus.set(fixtureId, match.status);

    // Best-effort real ball-by-ball — verified real failure mode (a
    // `status:"failure"` body) is handled by normalizeBalls returning [],
    // never by this throwing and taking the whole poll down with it.
    const bbb = await this.client.getMatchBallByBall(ref.matchId).catch(() => undefined);
    if (bbb) events.push(...normalizeBalls(bbb, { sessionId: input.sessionId, timestamp }));

    return events;
  }

  /**
   * Bonus method (not part of the shared `SportsProvider` interface,
   * same pattern as OpenF1Adapter's `getDriverTimingPatches`) — the
   * current-state refresh for `CricketInningsState`. Deliberately separate
   * from `pollLiveEvents`: fetching `match_scorecard` (needed for striker/
   * non-striker/current-bowler) on *every* poll tick would double this
   * adapter's real call volume against the confirmed 100/day cap; ingestion
   * calls this on its own, slower cadence instead — see
   * apps/ingestion/src/cricket/config.ts.
   */
  async getInningsState(fixtureId: string): Promise<cricket.CricketInningsState[]> {
    const matchId = fixtureRefFromId(fixtureId);
    const match = await this.fetchMatchInfo(matchId, "getInningsState");
    if (!match || !match.score) return [];

    const order = deriveInningsTeamOrder(match, buildTeamId);
    const scorecard = await this.client.getMatchScorecard(matchId).catch(() => undefined);
    const blocks = scorecard?.status === "success" ? scorecard.data?.scorecard : undefined;

    const states: cricket.CricketInningsState[] = [];
    for (let i = 0; i < match.score.length; i++) {
      const state = normalizeInningsState(match, i, order, blocks?.[i]);
      if (state) states.push(state);
    }
    return states;
  }

  /** Bonus method (not part of `SportsProvider`) — per-fixture toss/format/result. */
  async getFixtureDetail(fixtureId: string): Promise<cricket.CricketFixtureDetail | undefined> {
    const matchId = fixtureRefFromId(fixtureId);
    const match = await this.fetchMatchInfo(matchId, "getFixtureDetail");
    if (!match) return undefined;
    return normalizeFixtureDetail(match, { resolveTeamId: buildTeamId });
  }

  private async fetchMatchInfo(matchId: string, method = "getSessions"): Promise<CricketDataMatchSummary | undefined> {
    try {
      const response = await this.timed(method, () => this.client.getMatchInfo(matchId));
      return response.status === "success" ? response.data : undefined;
    } catch {
      return undefined;
    }
  }
}

function seriesIdFromCompetitionId(competitionId: string): string | undefined {
  const match = /^cricket-series-(.+)$/.exec(competitionId);
  return match?.[1];
}

function teamsInclude(match: CricketDataMatchSummary, teamId: string): boolean {
  return match.teamInfo.some((t) => buildTeamId(t.name) === teamId);
}

/** Re-exported for docs/CONTEXT.md's "verified `deriveFixtureStatus`" cross-references and future tests that want the raw function without importing normalize/fixture.ts directly. */
export { deriveFixtureStatus };
