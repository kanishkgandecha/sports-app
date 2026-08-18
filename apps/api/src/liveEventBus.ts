import { Client } from "pg";
import type { LiveEvent } from "@sports/domain";

/**
 * The API side of ARCHITECTURE.md §4 "real-time delivery": one dedicated
 * Postgres connection holds `LISTEN live_events`, and this class fans each
 * notification out to whichever SSE subscribers care about that session.
 * The ingestion worker is the only thing that ever calls `pg_notify` — see
 * apps/ingestion/src/publish.ts.
 */
export class LiveEventBus {
  private client: Client | undefined;
  private readonly subscribers = new Map<string, Set<(event: LiveEvent) => void>>();

  constructor(private readonly connectionString: string) {}

  async connect(): Promise<void> {
    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();
    await this.client.query("LISTEN live_events");

    this.client.on("notification", (msg) => {
      if (!msg.payload) return;
      let event: LiveEvent;
      try {
        event = JSON.parse(msg.payload) as LiveEvent;
      } catch {
        return;
      }
      const listeners = this.subscribers.get(event.sessionId);
      listeners?.forEach((listener) => listener(event));
    });

    this.client.on("error", (err) => {
      // A dropped LISTEN connection shouldn't crash the API process; the
      // affected SSE streams will simply stop receiving updates until a
      // future health check restarts this bus. Acceptable for Phase 0 —
      // reconnect-with-backoff is a Phase 1 hardening item.
      console.error("[live-event-bus] connection error", err);
    });
  }

  subscribe(sessionId: string, onEvent: (event: LiveEvent) => void): () => void {
    const listeners = this.subscribers.get(sessionId) ?? new Set();
    listeners.add(onEvent);
    this.subscribers.set(sessionId, listeners);
    return () => listeners.delete(onEvent);
  }

  async close(): Promise<void> {
    await this.client?.end();
  }
}
