/**
 * Thin HTTP layer over https://api.cricapi.com/v1 (CricketData.org's real
 * v1 REST API — the same base URL and endpoint catalog confirmed by real
 * calls this checkpoint, see types.ts's doc comment). Deliberately not a
 * copy of `OpenF1FetchClient`/`JolpicaFetchClient` — this vendor's real
 * conventions genuinely differ from both:
 *
 *  - **Always HTTP 200.** Verified: an invalid API key and a genuinely
 *    missing match/scorecard both return HTTP 200 with `{"status":
 *    "failure","reason":"..."}` in the body — never a 4xx. The only
 *    reliable success/failure signal is the body's `status` field, not the
 *    HTTP status code (unlike OpenF1's 404-for-empty or Jolpica's
 *    400-for-malformed).
 *  - **A hard daily quota, confirmed via the response body itself.** Every
 *    real response's `info.hitsLimit` was `100` (the free tier's real
 *    daily cap) with `info.hitsToday` counting up in real time as calls
 *    were made this checkpoint — not just documented, observed. This
 *    client does not implement its own rate limiting (the ingestion job's
 *    poll interval is what actually respects this — see apps/ingestion's
 *    Cricket config and docs/CONTEXT.md's rate-limit math), but every
 *    caller gets `info` back so a future caller could.
 */

import type {
  CricketDataBallByBallResponse,
  CricketDataErrorBody,
  CricketDataMatchInfoResponse,
  CricketDataMatchListResponse,
  CricketDataScorecardResponse,
  CricketDataSeriesInfoResponse,
} from "./types";

const BASE_URL = "https://api.cricapi.com/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

export class CricketDataRequestError extends Error {
  constructor(
    message: string,
    readonly path: string,
    /** The real `reason` string from a `{status:"failure"}` body, when this error came from one. */
    readonly reason?: string,
  ) {
    super(message);
    this.name = "CricketDataRequestError";
  }
}

export interface CricketDataHttpClient {
  getCurrentMatches(offset?: number): Promise<CricketDataMatchListResponse>;
  getMatchInfo(matchId: string): Promise<CricketDataMatchInfoResponse>;
  /**
   * Verified real failure mode: returns a `{status:"failure"}` body (never
   * throws for this specific case) when the provider has no scorecard for
   * this match — a real, common outcome (§ this file's doc comment),
   * distinct from a genuine transport/auth error, which still throws.
   */
  getMatchScorecard(matchId: string): Promise<CricketDataScorecardResponse>;
  /** Same "failure body, not a throw" contract as getMatchScorecard — verified real for a match with `bbbEnabled: false`. */
  getMatchBallByBall(matchId: string): Promise<CricketDataBallByBallResponse>;
  getSeriesInfo(seriesId: string): Promise<CricketDataSeriesInfoResponse>;
}

export interface CricketDataClientOptions {
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class CricketDataFetchClient implements CricketDataHttpClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CricketDataClientOptions) {
    if (!options.apiKey) {
      throw new Error("CricketDataFetchClient requires a real apiKey — see .env.example's CRICKETDATA_API_KEY");
    }
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getCurrentMatches(offset = 0): Promise<CricketDataMatchListResponse> {
    return this.get<CricketDataMatchListResponse>("/currentMatches", { offset });
  }

  async getMatchInfo(matchId: string): Promise<CricketDataMatchInfoResponse> {
    return this.get<CricketDataMatchInfoResponse>("/match_info", { id: matchId });
  }

  async getMatchScorecard(matchId: string): Promise<CricketDataScorecardResponse> {
    return this.getTolerant<CricketDataScorecardResponse>("/match_scorecard", { id: matchId });
  }

  async getMatchBallByBall(matchId: string): Promise<CricketDataBallByBallResponse> {
    return this.getTolerant<CricketDataBallByBallResponse>("/match_bbb", { id: matchId });
  }

  async getSeriesInfo(seriesId: string): Promise<CricketDataSeriesInfoResponse> {
    return this.get<CricketDataSeriesInfoResponse>("/series_info", { id: seriesId });
  }

  /** Throws on `status: "failure"` — for calls where a failure body is a genuine problem (auth, malformed request). */
  private async get<T extends { status: string }>(path: string, params: Record<string, string | number>): Promise<T> {
    const body = await this.getRaw<T>(path, params);
    if (body.status === "failure") {
      const reason = (body as unknown as CricketDataErrorBody).reason;
      throw new CricketDataRequestError(`CricketData.org rejected ${path}: ${reason ?? "unknown reason"}`, path, reason);
    }
    return body;
  }

  /** Returns the failure body as-is instead of throwing — for `match_scorecard`/`match_bbb`, where "no data for this match" is a real, expected outcome (verified this checkpoint), not an error. */
  private async getTolerant<T extends { status: string }>(path: string, params: Record<string, string | number>): Promise<T> {
    return this.getRaw<T>(path, params);
  }

  private async getRaw<T>(path: string, params: Record<string, string | number>): Promise<T> {
    const query = new URLSearchParams({ apikey: this.apiKey });
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }
    const url = `${BASE_URL}${path}?${query.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      // The API key travels in the query string (this vendor's real,
      // confirmed auth convention — no Authorization header exists for
      // this API). Never logged: adapter.ts's request-logging wrapper
      // (via BaseProviderAdapter.timed) logs only `path`/`status`/
      // `durationMs`, the same discipline as every other provider client
      // in this repo.
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new CricketDataRequestError(`Request to ${path} timed out after ${this.timeoutMs}ms`, path);
      }
      throw new CricketDataRequestError(
        `Network error requesting ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      // Never actually observed this checkpoint (every real call — valid
      // key, invalid key, missing match — returned 200) but a genuine
      // 5xx/network-proxy failure is still possible and must not be
      // silently swallowed.
      throw new CricketDataRequestError(`CricketData.org returned HTTP ${response.status} for ${path}`, path);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new CricketDataRequestError(
        `Malformed JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    }
  }
}
