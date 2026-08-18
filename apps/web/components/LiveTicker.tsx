"use client";

import { useEffect, useRef, useState } from "react";
import { FreshnessIndicator } from "./FreshnessIndicator";
import { API_BASE_URL } from "../lib/api";
import type { DataFreshnessState } from "@sports/design";

interface TickerEvent {
  id: string;
  eventType: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/**
 * Phase 0 exit criterion, rendered: subscribes to the synthetic session's
 * SSE stream and shows each LiveEvent as it arrives, through the real
 * FreshnessIndicator component — not a mock. If this panel is moving, the
 * ingestion -> Postgres -> SSE -> browser pipeline in ARCHITECTURE.md §4 is
 * proven end to end.
 */
export function LiveTicker() {
  const [events, setEvents] = useState<TickerEvent[]>([]);
  const [connection, setConnection] = useState<DataFreshnessState>("offline");
  const lastEventAt = useRef<string>(new Date().toISOString());

  useEffect(() => {
    const source = new EventSource(`${API_BASE_URL}/api/sessions/synthetic-session/stream`);

    source.addEventListener("ready", () => setConnection("delayed"));
    source.addEventListener("live-event", (raw) => {
      const event = JSON.parse((raw as MessageEvent).data) as TickerEvent;
      lastEventAt.current = event.timestamp;
      setConnection("live");
      setEvents((prev) => [event, ...prev].slice(0, 8));
    });
    source.onerror = () => setConnection("offline");

    return () => source.close();
  }, []);

  return (
    <section
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        background: "var(--color-surface)",
        padding: "var(--space-5)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-3)",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: "var(--font-size-lg)" }}>Synthetic pipeline check</h3>
        <FreshnessIndicator state={connection} updatedAt={lastEventAt.current} />
      </header>
      <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
        Not a real sport — this proves the ingestion → Postgres → SSE → browser pipeline
        (ARCHITECTURE.md §7) before Phase 1 touches real F1 data.
      </p>
      <ol
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          fontFamily: "var(--font-data)",
          fontSize: "var(--font-size-xs)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {events.length === 0 && (
          <li style={{ color: "var(--color-text-faint)" }}>Waiting for the ingestion worker…</li>
        )}
        {events.map((event) => (
          <li key={event.id} style={{ color: "var(--color-text-muted)" }}>
            <span style={{ color: "var(--color-text)" }}>{event.eventType}</span>{" "}
            {JSON.stringify(event.payload)}
          </li>
        ))}
      </ol>
    </section>
  );
}
