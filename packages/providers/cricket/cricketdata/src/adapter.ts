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
import { CRICKET_SPORT_ID, buildCompetitionId, buildFixtureId, buildSessionId, buildTeamId, fixtureRefFromId, sessionRefFromId } from "./reference";
import { normalizeCompetition, normalizeSeason } from "./normalize/competition";
import { deriveFixtureStatus, normalizeFixture, normalizeFixtureDetail, normalizeVenue } from "./normalize/fixture";
import { normalizeTeams } from "./normalize/team";
import { normalizePlayersFromScorecard } from "./normalize/player";
import { deriveInningsTeamOrder, normalizeInningsState, normalizeSessions } from "./normalize/innings";
import { diffInningsScore, diffMatchStatus, normalizeBalls } from "./normalize/events";
import { normalizeBattingFigures, normalizeBowlingFigures } from "./normalize/scorecard";
import type {
  CricketDataBallByBallResponse,
  CricketDataMatchInfoResponse,
  CricketDataMatchListResponse,
  CricketDataMatchSummary,
  CricketDataResponseInfo,
  CricketDataScoreEntry,
  CricketDataScorecardResponse,
  CricketDataSeriesInfoResponse,
} from "./types";

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
 *    metadata** (`info.hitsLimit`), not just documentation. Every real
 *    request this adapter can make goes through one shared, single-flight,
 *    TTL-cached primitive (`cachedRequest`, below) keyed by exactly what
 *    it's fetching (the current-matches list; one match's `match_info`;
 *    one match's `match_scorecard`/`match_bbb`; one series' `series_info`)
 *    — `getFixtures`/`getTeams`/`getVenues`/`getPlayers` share the current-
 *    matches cache; `getInningsState`/`getScorecard`/`getRosterForFixture`/
 *    `getFixtureDetail`/`pollLiveEvents` share the match-info cache;
 *    `getCompetitions`/`getSeasons` share the series-info cache per series.
 *    **This was NOT always true** — Cricket Checkpoint 4's request-budget
 *    remediation (docs/CONTEXT.md) found and fixed a real bug where
 *    `match_info`/`series_info` had no cache at all, so a single ingestion
 *    tick's `Promise.all` over the four state-refresh methods made 4
 *    duplicate real `match_info` requests instead of 1, and bootstrap made
 *    a duplicate `series_info` request per series (once from
 *    `getCompetitions`, again from `getSeasons`) every single tick — see
 *    that section for the full audit and the corrected request arithmetic.
 *    `getRequestBudgetStatus()` additionally exposes the provider's own
 *    live-reported `hitsToday`/`hitsLimit` so `apps/ingestion` can skip
 *    optional work once real usage is close to the daily cap.
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

  /**
   * Cricket Checkpoint 4 (request-budget remediation) — one single-flight,
   * TTL-cached, per-key request cache shared by every real endpoint this
   * adapter calls, replacing three separate ad hoc caches (Checkpoints
   * 1-2) that were only ever safe against *sequential* callers.
   * `apps/ingestion/src/cricket/job.ts`'s real state-refresh tick calls
   * `getInningsState`/`getScorecard`/`getRosterForFixture`/
   * `getFixtureDetail` via `Promise.all` — genuinely concurrent — and the
   * old "check cache, `await` fetch, then write cache" pattern let every
   * concurrent caller observe a miss before the first one's fetch had
   * resolved, so up to 4 real, duplicate `match_info` requests fired for
   * what should have been 1. Caching the in-flight *promise*, written
   * synchronously in `cachedRequest` below (before its own first
   * `await` — there isn't one), closes that gap: thanks to JS's
   * run-to-completion semantics, `Promise.all([a(), b()])` invokes `a()`
   * and `b()` back-to-back synchronously up to each one's first real
   * `await` — the first caller's cache write always lands before the
   * second caller's read, no matter how many concurrent callers there
   * are sharing the same key. A rejected fetch is cached too (concurrent
   * callers should share one failure, not each independently retry and
   * fail against the same dead request) but still expires normally at
   * the TTL — never poisoned forever.
   *
   * Keys: `"currentMatches"` (one global entry), `` `matchInfo:${matchId}` ``,
   * `` `scorecard:${matchId}` ``, `` `bbb:${matchId}` ``,
   * `` `series:${seriesId}` ``. 5 minutes for all of them — far shorter
   * than any real ingestion cadence (`cricketPollIntervalMs`≥30min,
   * `cricketInningsStateIntervalMs`≥60min — apps/ingestion/src/config.ts),
   * so this never blunts live-score responsiveness; it only collapses
   * calls that were already happening within the same tick (or, for
   * `matchInfo`, between a poll tick and a state-refresh tick landing
   * close together).
   */
  private readonly requestCache = new Map<string, { fetchedAt: number; promise: Promise<unknown> }>();
  private static readonly REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;

  /**
   * The provider's own real, live-reported usage (`info.hitsToday`/
   * `hitsLimit` — confirmed real on every response, see client.ts's doc
   * comment), observed passively from whichever real (non-cache-hit)
   * response happens to come back — never a request spent just to check
   * it. `undefined` until this process has made at least one real
   * request. See `getRequestBudgetStatus`.
   */
  private lastKnownUsage: { hitsToday: number; hitsLimit: number; observedAt: number } | undefined;

  constructor(options: { client?: CricketDataHttpClient; apiKey?: string; onRequest?: RequestLogger; maxSeriesLookups?: number } = {}) {
    super(options.onRequest);
    this.client = options.client ?? new CricketDataFetchClient({ apiKey: options.apiKey ?? "" });
    this.maxSeriesLookups = options.maxSeriesLookups ?? 5;
  }

  /**
   * The single-flight cache primitive every `getCached*`/`fetch*` method
   * below builds on. Deliberately a plain (non-`async`) method — the
   * *lack* of an `await` before `this.requestCache.set` below is exactly
   * what makes concurrent callers safe (see this class's field doc
   * comment above), not an incidental style choice; making this `async`
   * would reintroduce the original bug by inserting a microtask boundary
   * before the cache write.
   */
  private cachedRequest<T>(key: string, method: string, fetch: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const cached = this.requestCache.get(key);
    if (cached && now - cached.fetchedAt < CricketDataAdapter.REQUEST_CACHE_TTL_MS) {
      return cached.promise as Promise<T>;
    }
    const promise = this.timed(method, fetch).then((response) => {
      // Duck-typed rather than a generic constraint — `CricketDataBallByBallResponse`
      // genuinely has no `info` field (verified, types.ts), and a generic
      // constraint requiring one confused inference for that call site
      // more than it was worth; every response shape that *does* carry
      // real usage metadata still gets recorded here.
      const info = (response as { info?: CricketDataResponseInfo }).info;
      if (info) this.recordUsage(info);
      return response;
    });
    this.requestCache.set(key, { fetchedAt: now, promise });
    return promise;
  }

  private recordUsage(info: CricketDataResponseInfo): void {
    this.lastKnownUsage = { hitsToday: info.hitsToday, hitsLimit: info.hitsLimit, observedAt: Date.now() };
  }

  /**
   * Bonus method (not part of `SportsProvider`) — Cricket Checkpoint 4.
   * `apps/ingestion/src/cricket/job.ts` checks this before spending any
   * further real requests in a tick, skipping optional/expensive work
   * once real, provider-reported usage is close to the daily cap. This is
   * a *reactive* guard, not a perfect preventive one — an honest,
   * disclosed limitation: it's only as fresh as the last real request
   * this process happened to make, so a freshly-started process (or a
   * key shared with other concurrent usage outside this process) can
   * still begin a tick already close to the limit without this having
   * observed it yet. See docs/CONTEXT.md's Cricket Checkpoint 4
   * remediation section for the full reasoning and the alternative
   * (a persistent, cross-process quota tracker) this deliberately doesn't
   * build, as overkill for a single-key dev-tier integration.
   */
  getRequestBudgetStatus(): { hitsToday: number; hitsLimit: number; observedAt: number } | undefined {
    return this.lastKnownUsage;
  }

  private getCachedCurrentMatches(method: string): Promise<CricketDataMatchListResponse> {
    return this.cachedRequest("currentMatches", method, () => this.client.getCurrentMatches());
  }

  /** Swallows to `undefined` on failure — same posture as the original per-id `.catch(() => undefined)` in `getCompetitions`, now shared with `getSeasons` via the same cache key so the two never issue duplicate real requests for the same series within the TTL (the real bug this checkpoint's remediation found — see the class doc comment). */
  private async getCachedSeriesInfo(seriesId: string, method: string): Promise<CricketDataSeriesInfoResponse | undefined> {
    try {
      return await this.cachedRequest(`series:${seriesId}`, method, () => this.client.getSeriesInfo(seriesId));
    } catch {
      return undefined;
    }
  }

  async getCompetitions(): Promise<Competition[]> {
    const matches = await this.getCachedCurrentMatches("getCompetitions");
    const seriesIds = [...new Set(matches.data.map((m) => m.series_id))].slice(0, this.maxSeriesLookups);
    const infos = await Promise.all(seriesIds.map((id) => this.getCachedSeriesInfo(id, "getCompetitions")));

    const competitions: Competition[] = [];
    for (const info of infos) {
      if (info?.status === "success" && info.data) competitions.push(normalizeCompetition(info.data.info));
    }
    return competitions;
  }

  async getSeasons(input: { competitionId: string }): Promise<Season[]> {
    const seriesId = seriesIdFromCompetitionId(input.competitionId);
    if (!seriesId) return [];
    const response = await this.getCachedSeriesInfo(seriesId, "getSeasons");
    if (!response || response.status !== "success" || !response.data) return [];
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
      const scorecard = await this.getCachedMatchScorecard(match.id, "getPlayers");
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
    // Cached (Cricket Checkpoint 4) the same as `match_info`: if a second
    // session of this same fixture is also active this tick (the real,
    // documented `endTime`-not-yet-written scenario — see
    // `activeSessions.ts`), this is what stops both sessions' polls from
    // each spending their own real `match_bbb` request for the same match.
    const bbb = await this.fetchBallByBall(ref.matchId, "pollLiveEvents");
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
    const scorecard = await this.getCachedMatchScorecard(matchId, "getInningsState");
    const blocks = scorecard?.status === "success" ? scorecard.data?.scorecard : undefined;

    const states: cricket.CricketInningsState[] = [];
    for (let i = 0; i < match.score.length; i++) {
      const state = normalizeInningsState(match, i, order, blocks?.[i]);
      if (state) states.push(state);
    }
    return states;
  }

  /**
   * Bonus method (not part of `SportsProvider`) — Checkpoint 2's batting
   * scorecard/bowling figures. Deliberately per-innings (one entry per
   * real `score[]` index, matching `getInningsState`'s own indexing) —
   * `undefined` for an innings the real scorecard doesn't have a block
   * for (verified real: `match_scorecard` can be entirely unavailable for
   * a match that IS live — see types.ts), never a fabricated empty list
   * presented as "we checked, there's nothing."
   */
  async getScorecard(
    fixtureId: string,
  ): Promise<Array<{ sessionId: string; batting: cricket.CricketBattingFigure[]; bowling: cricket.CricketBowlingFigure[] } | undefined>> {
    const matchId = fixtureRefFromId(fixtureId);
    const match = await this.fetchMatchInfo(matchId, "getScorecard");
    if (!match || !match.score) return [];

    const scorecard = await this.getCachedMatchScorecard(matchId, "getScorecard");
    const blocks = scorecard?.status === "success" ? scorecard.data?.scorecard : undefined;

    return match.score.map((_entry, i) => {
      const block = blocks?.[i];
      if (!block) return undefined;
      const sessionId = buildSessionId(matchId, i + 1);
      return {
        sessionId,
        batting: normalizeBattingFigures(block, sessionId),
        bowling: normalizeBowlingFigures(block, sessionId),
      };
    });
  }

  /**
   * Bonus method (not part of `SportsProvider`) — Checkpoint 2's real gap
   * closer: `getScorecard`'s figures carry only `playerId`, and nothing in
   * the Cricket ingestion pipeline otherwise persists real `Player` rows
   * (found while wiring up the API/UI — `getPlayers()` above is a
   * separate, batch-oriented, budget-capped method never actually called
   * by the per-fixture job tick). Reuses the SAME cached
   * `match_scorecard` fetch `getInningsState`/`getScorecard` already made
   * this tick — no extra real request — to return real, named `Team`/
   * `Player` rows for exactly the players who appear in this fixture's
   * scorecard, so the API can join real names the same way
   * `apps/api/src/routes/f1.ts`'s `driversById` already does for F1.
   */
  async getRosterForFixture(fixtureId: string): Promise<{ teams: Team[]; players: Player[] }> {
    const matchId = fixtureRefFromId(fixtureId);
    const match = await this.fetchMatchInfo(matchId, "getRosterForFixture");
    if (!match) return { teams: [], players: [] };

    const scorecard = await this.getCachedMatchScorecard(matchId, "getRosterForFixture");
    const blocks = scorecard?.status === "success" ? scorecard.data?.scorecard : undefined;
    const order = deriveInningsTeamOrder(match, buildTeamId);

    const players: Player[] = [];
    (blocks ?? []).forEach((block, i) => {
      const teams = order[i];
      if (teams) players.push(...normalizePlayersFromScorecard(block, teams));
    });

    const seen = new Set<string>();
    return {
      teams: normalizeTeams(match),
      players: players.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))),
    };
  }

  /** Bonus method (not part of `SportsProvider`) — per-fixture toss/format/result. */
  async getFixtureDetail(fixtureId: string): Promise<cricket.CricketFixtureDetail | undefined> {
    const matchId = fixtureRefFromId(fixtureId);
    const match = await this.fetchMatchInfo(matchId, "getFixtureDetail");
    if (!match) return undefined;
    return normalizeFixtureDetail(match, { resolveTeamId: buildTeamId });
  }

  /**
   * `getInningsState`/`getScorecard`/`getRosterForFixture`/
   * `getFixtureDetail`/`pollLiveEvents`/`getSessions`' fallback path all
   * want the same real `match_info` for one `matchId` — routed through
   * `cachedRequest` (this class's field doc comment above has the full
   * concurrency-safety reasoning). Swallows to `undefined` on failure,
   * same posture as every other bonus method here — a match this adapter
   * can't currently fetch info for is a real, expected outcome (a
   * malformed id, a transient network error), not a reason to crash the
   * caller.
   */
  private async fetchMatchInfo(matchId: string, method = "getSessions"): Promise<CricketDataMatchSummary | undefined> {
    let response: CricketDataMatchInfoResponse;
    try {
      response = await this.cachedRequest(`matchInfo:${matchId}`, method, () => this.client.getMatchInfo(matchId));
    } catch {
      return undefined;
    }
    return response.status === "success" ? response.data : undefined;
  }

  /** Same reasoning as `fetchMatchInfo`, for `match_scorecard`. */
  private async getCachedMatchScorecard(matchId: string, method: string): Promise<CricketDataScorecardResponse | undefined> {
    try {
      return await this.cachedRequest(`scorecard:${matchId}`, method, () => this.client.getMatchScorecard(matchId));
    } catch {
      return undefined;
    }
  }

  /** Same reasoning again, for `match_bbb` — see `pollLiveEvents`'s call site for why this one specifically matters (two active sessions of the same fixture sharing one match's ball-by-ball fetch). */
  private async fetchBallByBall(matchId: string, method: string): Promise<CricketDataBallByBallResponse | undefined> {
    try {
      return await this.cachedRequest(`bbb:${matchId}`, method, () => this.client.getMatchBallByBall(matchId));
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
