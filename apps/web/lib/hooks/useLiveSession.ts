"use client";

import { useEffect, useRef, useState } from "react";
import { computeFreshness, type FreshnessInfo, type LiveEvent } from "@sports/domain";
import { API_BASE_URL } from "../api";

export type ConnectionState = "connecting" | "open" | "closed";

const RECONNECT_DELAY_MS = 3000;
/** How often freshness re-evaluates against the clock even with no new events — matches FreshnessIndicator's own tick. */
const FRESHNESS_TICK_MS = 1000;

export interface UseLiveSessionOptions {
  /** From the session's own lifecycle (`GET /api/f1/sessions/:id`) — freshness must never read LIVE for a session that isn't actually live, regardless of SSE connection state. */
  isLive: boolean;
  /** Seeds freshness correctly on first render, before any SSE event has arrived — the server's own freshness snapshot from page load. */
  initialLastEventAt?: string | null;
  /** Called for every LiveEvent as it arrives — callers merge it into whatever state they own (timing table, race control feed, ...). This hook does not interpret event payloads itself. */
  onEvent?: (event: LiveEvent) => void;
}

export interface UseLiveSessionResult {
  connectionState: ConnectionState;
  freshness: FreshnessInfo;
}

/**
 * The Event Center's one live-data boundary (Checkpoint 5's explicit
 * requirement — "do not create separate SSE implementations for every
 * component"). Every section (timing tower, race control, pit stops)
 * subscribes to the same session's events through this single hook
 * instance, each supplying its own `onEvent` to pick out what it cares
 * about — see F1EventCenter.tsx for how the events fan out.
 */
export function useLiveSession(sessionId: string | null, options: UseLiveSessionOptions): UseLiveSessionResult {
  const { isLive, initialLastEventAt = null, onEvent } = options;
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastEventAt, setLastEventAt] = useState<string | null>(initialLastEventAt);
  const [now, setNow] = useState(() => Date.now());

  // Avoids re-subscribing every time the caller passes a fresh onEvent
  // closure (e.g. from a component re-render) — only sessionId/isLive
  // changes should tear down and reopen the connection.
  const onEventRef = useRef(onEvent);
  const lastSequenceRef = useRef<string | null>(null);
  onEventRef.current = onEvent;

  useEffect(() => {
    setLastEventAt(initialLastEventAt);
    lastSequenceRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), FRESHNESS_TICK_MS);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionId || !isLive) {
      setConnectionState("closed");
      return;
    }

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      setConnectionState("connecting");
      const after = lastSequenceRef.current ? `?after=${encodeURIComponent(lastSequenceRef.current)}` : "";
      source = new EventSource(`${API_BASE_URL}/api/sessions/${sessionId}/stream${after}`);

      source.addEventListener("ready", () => {
        if (!cancelled) setConnectionState("open");
      });

      source.addEventListener("live-event", (raw) => {
        if (cancelled) return;
        let event: LiveEvent;
        try {
          event = JSON.parse((raw as MessageEvent).data) as LiveEvent;
        } catch {
          return; // malformed payload — never crash the live surface over it
        }
        const sequence = (event as LiveEvent & { sequence?: unknown }).sequence;
        if (typeof sequence === "string") lastSequenceRef.current = sequence;
        setLastEventAt(event.timestamp);
        onEventRef.current?.(event);
      });

      source.onerror = () => {
        if (cancelled) return;
        setConnectionState("closed");
        source?.close();
        // Explicit reconnect rather than relying solely on the browser's
        // native EventSource retry — gives observable connectionState
        // transitions and a predictable, testable cadence.
        reconnectTimer = setTimeout(() => {
          if (!cancelled) connect();
        }, RECONNECT_DELAY_MS);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
    };
  }, [sessionId, isLive]);

  const freshness = computeFreshness({ lastEventAt, isLive, now });

  return { connectionState, freshness };
}

/** Exposed for tests that need to reason about the hook's timing constants. */
export const __TESTING__ = { RECONNECT_DELAY_MS, FRESHNESS_TICK_MS };
