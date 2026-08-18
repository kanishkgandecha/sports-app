/**
 * Thin HTTP layer over https://api.jolpi.ca/ergast/f1 — deliberately
 * separate from normalization, same reasoning as OpenF1FetchClient
 * (packages/providers/f1/openf1/src/client.ts). NOT a copy of that file:
 * Jolpica's response/error conventions are genuinely different, verified
 * against the real API (docs/CONTEXT.md, Checkpoint 6 §1):
 *
 *  - "No rows matched" is HTTP 200 with an empty `StandingsLists`/`Races`
 *    array inside the MRData envelope — NOT a 404, unlike OpenF1. Confirmed
 *    against `/2099/driverstandings/` (a season far in the future).
 *  - A malformed/incomplete request (e.g. a bad path) is HTTP 400 with body
 *    `{"detail": "..."}"`, not a 404.
 *  - Every payload is wrapped in an `MRData` envelope that has to be
 *    unwrapped, and which of `StandingsTable`/`RaceTable`/`SeasonTable` is
 *    present depends on which endpoint was called.
 */

import type {
  JolpicaConstructorStanding,
  JolpicaDriverStanding,
  JolpicaErrorBody,
  JolpicaRace,
  JolpicaResponse,
  JolpicaSeason,
} from "./types";

const BASE_URL = "https://api.jolpi.ca/ergast/f1";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_500;

export class JolpicaRequestError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "JolpicaRequestError";
  }
}

export interface JolpicaHttpClient {
  getDriverStandings(year: number): Promise<JolpicaDriverStanding[]>;
  getConstructorStandings(year: number): Promise<JolpicaConstructorStanding[]>;
  getSeasons(params?: { limit?: number; offset?: number }): Promise<JolpicaSeason[]>;
  getRaces(year: number): Promise<JolpicaRace[]>;
}

export interface JolpicaClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Same reasoning as OpenF1FetchClient's maxRetries — retry a rate limit once at the HTTP layer rather than in every caller. Jolpica's rate-limit response wasn't directly observed this checkpoint (no 429 hit during research), but the retry path costs nothing to keep and matches the sibling adapter's resilience posture. */
  maxRetries?: number;
  retryDelayMs?: number;
}

export class JolpicaFetchClient implements JolpicaHttpClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: JolpicaClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async getDriverStandings(year: number): Promise<JolpicaDriverStanding[]> {
    const response = await this.get(`/${year}/driverstandings/`);
    const list = response.MRData.StandingsTable?.StandingsLists ?? [];
    return list[0]?.DriverStandings ?? [];
  }

  async getConstructorStandings(year: number): Promise<JolpicaConstructorStanding[]> {
    const response = await this.get(`/${year}/constructorstandings/`);
    const list = response.MRData.StandingsTable?.StandingsLists ?? [];
    return list[0]?.ConstructorStandings ?? [];
  }

  async getSeasons(params: { limit?: number; offset?: number } = {}): Promise<JolpicaSeason[]> {
    const query = new URLSearchParams();
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const queryString = query.toString();
    const response = await this.get(`/seasons/${queryString ? `?${queryString}` : ""}`);
    return response.MRData.SeasonTable?.Seasons ?? [];
  }

  async getRaces(year: number): Promise<JolpicaRace[]> {
    const response = await this.get(`/${year}.json`);
    return response.MRData.RaceTable?.Races ?? [];
  }

  private async get(path: string): Promise<JolpicaResponse> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.getOnce(path);
      } catch (error) {
        const isRateLimit = error instanceof JolpicaRequestError && error.status === 429;
        if (!isRateLimit || attempt >= this.maxRetries) throw error;
        attempt += 1;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }
  }

  private async getOnce(path: string): Promise<JolpicaResponse> {
    const url = `${BASE_URL}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      // No auth header — Jolpica is free/unauthenticated (docs/CONTEXT.md,
      // Checkpoint 1 research + Checkpoint 6 §1 re-verification).
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new JolpicaRequestError(`Request to ${path} timed out after ${this.timeoutMs}ms`, path);
      }
      throw new JolpicaRequestError(
        `Network error requesting ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      throw new JolpicaRequestError(`Rate limited by Jolpica (429) requesting ${path}`, path, 429);
    }

    if (response.status === 400) {
      // Verified real shape: {"detail":"Bad Request: Missing one of the
      // required parameters ['season_year']."} — surface the real detail
      // message rather than a generic one, it's genuinely informative.
      let detail = "Bad Request";
      try {
        const body = (await response.json()) as JolpicaErrorBody;
        detail = body.detail ?? detail;
      } catch {
        // body wasn't JSON — fall through with the generic message
      }
      throw new JolpicaRequestError(`Jolpica rejected request to ${path}: ${detail}`, path, 400);
    }

    if (!response.ok) {
      throw new JolpicaRequestError(`Jolpica returned ${response.status} for ${path}`, path, response.status);
    }

    try {
      const body = await response.json();
      if (typeof body !== "object" || body === null || !("MRData" in body)) {
        throw new JolpicaRequestError(`Expected an MRData envelope from ${path}`, path);
      }
      return body as JolpicaResponse;
    } catch (error) {
      if (error instanceof JolpicaRequestError) throw error;
      throw new JolpicaRequestError(
        `Malformed JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    }
  }
}
