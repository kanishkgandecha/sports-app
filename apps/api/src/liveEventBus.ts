import { Client } from "pg";
import { parseLiveEvent, type SequencedLiveEvent } from "@sports/domain";

/**
 * The API side of ARCHITECTURE.md §4 "real-time delivery": one dedicated
 * Postgres connection holds `LISTEN live_events`, and this class fans each
 * notification out to whichever SSE subscribers care about that session.
 * The ingestion worker is the only thing that ever calls `pg_notify` — see
 * apps/ingestion/src/publish.ts.
 */
export class LiveEventBus {
  private client: Client | undefined;
  private readonly subscribers = new Map<string, Set<(event: SequencedLiveEvent) => void>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectAttempt = 0;
  private closing = false;

  constructor(private readonly connectionString: string) {}

  get isConnected(): boolean {
    return this.client !== undefined && !this.closing;
  }

  async connect(): Promise<void> {
    this.closing = false;
    await this.connectClient();
  }

  private async connectClient(): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    try {
      await client.connect();
      await client.query("LISTEN live_events");
    } catch (error) {
      await client.end().catch(() => undefined);
      throw error;
    }
    this.client = client;
    this.reconnectAttempt = 0;

    client.on("notification", (msg) => {
      if (!msg.payload) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(msg.payload);
      } catch {
        return;
      }
      const event = parseLiveEvent(parsed);
      if (!event || !("sequence" in event)) return;
      const listeners = this.subscribers.get(event.sessionId);
      listeners?.forEach((listener) => listener(event));
    });

    client.on("error", (err) => {
      console.error("[live-event-bus] connection error", err);
      this.scheduleReconnect(client);
    });
    client.on("end", () => this.scheduleReconnect(client));
  }

  private scheduleReconnect(failedClient?: Client): void {
    if (this.closing || (failedClient && this.client !== failedClient) || this.reconnectTimer) return;
    this.client = undefined;
    const delayMs = Math.min(30_000, 500 * 2 ** this.reconnectAttempt++);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connectClient().catch((error) => {
        console.error("[live-event-bus] reconnect failed", error);
        this.scheduleReconnect();
      });
    }, delayMs);
    this.reconnectTimer.unref?.();
  }

  subscribe(sessionId: string, onEvent: (event: SequencedLiveEvent) => void): () => void {
    const listeners = this.subscribers.get(sessionId) ?? new Set();
    listeners.add(onEvent);
    this.subscribers.set(sessionId, listeners);
    return () => listeners.delete(onEvent);
  }

  async close(): Promise<void> {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const client = this.client;
    this.client = undefined;
    await client?.end();
  }
}
