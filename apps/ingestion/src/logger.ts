import pino from "pino";

/**
 * Structured logging for the new F1 job (Checkpoint 4, docs/CONTEXT.md §9).
 * The Phase 0 synthetic job's plain console.log/error is left untouched —
 * it's a health-check job, not something operators need to filter/query.
 * Never log credentials — nothing here ever logs headers, API keys, or full
 * request params, only method/status/duration/counts, matching the pattern
 * `BaseProviderAdapter.timed()` already established at Checkpoint 3.
 */
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
