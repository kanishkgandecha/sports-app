import pino from "pino";

/**
 * Structured logging for the F1 ingestion worker.
 * Never log credentials — nothing here ever logs headers, API keys, or full
 * request params, only method/status/duration/counts, matching the pattern
 * `BaseProviderAdapter.timed()` already established at Checkpoint 3.
 */
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
