/**
 * Rate-limited (not just concurrency-limited) sequential map — used by the
 * F1 calendar bootstrap when fetching sessions for ~24-27 fixtures.
 *
 * A first version of this only capped simultaneous in-flight requests
 * (`mapWithConcurrency(items, 3, ...)`), reasoning that OpenF1's free tier
 * allows "3 req/s." That's wrong: limiting concurrency to 3 doesn't cap the
 * *rate* — each request round-trips in ~100-200ms, so 3-at-a-time can still
 * fire well over 3 requests/second. A live smoke test against the real API
 * confirmed this: bootstrapping the 2026 season hit real 429s from OpenF1
 * partway through (docs/CONTEXT.md §9's Problem/Root cause/Solution entry).
 * Fixed by pacing dispatch itself, one request at a time with an explicit
 * minimum delay between them — the only way to actually bound requests/sec.
 */
export async function mapWithRateLimit<T, R>(
  items: T[],
  minDelayMs: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    results[i] = await fn(items[i], i);
    if (i < items.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, minDelayMs));
    }
  }
  return results;
}
