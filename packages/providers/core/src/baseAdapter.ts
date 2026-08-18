import type { ProviderRequestLog, SportsProvider } from "./types";

export type RequestLogger = (log: ProviderRequestLog) => void;

/**
 * Shared scaffolding for provider adapters: every real HTTP/websocket call
 * an adapter makes should go through `timed()` so request logging (latency,
 * failures) is uniform across vendors from day one — see ARCHITECTURE.md §4
 * "Observability" and master brief §21. Adapters implement `SportsProvider`
 * directly; this class only adds the logging wrapper, so it stays opt-in.
 */
export abstract class BaseProviderAdapter implements Partial<SportsProvider> {
  abstract readonly id: string;
  abstract readonly sportId: string;

  constructor(private readonly onRequest?: RequestLogger) {}

  protected async timed<T>(method: string, fn: () => Promise<T>): Promise<T> {
    const start = Date.now();
    try {
      const result = await fn();
      this.onRequest?.({
        providerId: this.id,
        method,
        requestedAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        ok: true,
      });
      return result;
    } catch (error) {
      this.onRequest?.({
        providerId: this.id,
        method,
        requestedAt: new Date(start).toISOString(),
        durationMs: Date.now() - start,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
