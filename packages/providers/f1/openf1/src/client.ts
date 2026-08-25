/**
 * Thin HTTP layer over https://api.openf1.org/v1. Deliberately separate from
 * normalization (docs/CONTEXT.md "keep normalization testable and separate
 * from HTTP request logic") and deliberately behind an interface
 * (`OpenF1HttpClient`) so `OpenF1Adapter` can be tested with a fixture-backed
 * fake client instead of the live network — see adapter.test.ts.
 */

const BASE_URL = "https://api.openf1.org/v1";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 1_500;

export class OpenF1RequestError extends Error {
  constructor(
    message: string,
    readonly path: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenF1RequestError";
  }
}

export interface OpenF1HttpClient {
  /**
   * GET one OpenF1 endpoint. `params` values are stringified into the query
   * string as-is — pass an already-prefixed key like `"date>"` to use
   * OpenF1's comparison-operator query convention (verified working against
   * the real API — see docs/CONTEXT.md §8).
   *
   * OpenF1 represents "no rows matched" as HTTP 404 with body
   * `{"detail":"No results found."}` — verified against multiple endpoints
   * with both a well-formed-but-empty filter and a nonsense key. This is
   * NOT an error condition; implementations must return `[]` for it while
   * still treating every other non-2xx status as a real failure.
   */
  get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T[]>;
}

export interface OpenF1ClientOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /**
   * How many times to retry a 429 before giving up — added at Checkpoint 4
   * after a live smoke test hit real rate limiting mid-bootstrap more than
   * once, even after pacing the calendar bootstrap's own request rate (see
   * docs/CONTEXT.md §9's rate-limit Problem/Solution entry). Retrying here,
   * once, at the HTTP layer, benefits every caller — bootstrap, live
   * polling, roster fetches — rather than each call site inventing its own
   * recovery. Set to 0 in tests to keep them fast.
   */
  maxRetries?: number;
  retryDelayMs?: number;
}

export class OpenF1FetchClient implements OpenF1HttpClient {
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: OpenF1ClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T[]> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.getOnce<T>(path, params);
      } catch (error) {
        const isRateLimit = error instanceof OpenF1RequestError && error.status === 429;
        if (!isRateLimit || attempt >= this.maxRetries) throw error;
        attempt += 1;
        // Linear backoff (1x, 2x delay) — simple and sufficient for a
        // handful of retries; this isn't a queueing system.
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
      }
    }
  }

  private async getOnce<T>(path: string, params: Record<string, string | number | undefined>): Promise<T[]> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query.set(key, String(value));
    }
    const queryString = query.toString();
    const url = `${BASE_URL}${path}${queryString ? `?${queryString}` : ""}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      // No auth header is sent — this client only ever calls OpenF1's free,
      // unauthenticated historical endpoints (see docs/CONTEXT.md §6). If a
      // future checkpoint adds authenticated real-time access, the API key
      // must be read from an env var here and NEVER included in any log line
      // — see the request-logging wrapper in adapter.ts, which logs `path`
      // and `status`/`durationMs` only, never headers or query params.
      response = await this.fetchImpl(url, { signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new OpenF1RequestError(`Request to ${path} timed out after ${this.timeoutMs}ms`, path);
      }
      throw new OpenF1RequestError(
        `Network error requesting ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404) {
      // OpenF1's convention for "zero rows matched this query" — not a failure.
      return [];
    }

    if (response.status === 429) {
      throw new OpenF1RequestError(
        `Rate limited by OpenF1 (429) requesting ${path}`,
        path,
        429,
      );
    }

    if (!response.ok) {
      throw new OpenF1RequestError(
        `OpenF1 returned ${response.status} for ${path}`,
        path,
        response.status,
      );
    }

    try {
      const body = await response.json();
      if (!Array.isArray(body)) {
        throw new OpenF1RequestError(`Expected an array response from ${path}, got ${typeof body}`, path);
      }
      return body as T[];
    } catch (error) {
      if (error instanceof OpenF1RequestError) throw error;
      throw new OpenF1RequestError(
        `Malformed JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`,
        path,
      );
    }
  }
}
