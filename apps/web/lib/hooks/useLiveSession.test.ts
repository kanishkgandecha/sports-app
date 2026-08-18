import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLiveSession, __TESTING__ } from "./useLiveSession";

/**
 * jsdom doesn't implement EventSource — this mock stands in for the real
 * browser API, letting tests drive "ready"/"live-event"/error deterministically.
 */
class MockEventSource {
  static instances: MockEventSource[] = [];
  url: string;
  closed = false;
  listeners: Record<string, ((ev: unknown) => void)[]> = {};
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }
  addEventListener(type: string, cb: (ev: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data?: unknown) {
    this.listeners[type]?.forEach((cb) => cb({ data: JSON.stringify(data ?? {}) }));
  }
  triggerError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockEventSource.instances = [];
  // @ts-expect-error — test double for the browser API jsdom lacks
  global.EventSource = MockEventSource;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useLiveSession", () => {
  it("starts in 'connecting' and opens an EventSource to the session's stream URL", () => {
    renderHook(() => useLiveSession("session-1", { isLive: true }));
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toContain("/api/sessions/session-1/stream");
  });

  it("transitions to 'open' on the server's ready event", () => {
    const { result } = renderHook(() => useLiveSession("session-1", { isLive: true }));
    expect(result.current.connectionState).toBe("connecting");

    act(() => MockEventSource.instances[0].emit("ready"));
    expect(result.current.connectionState).toBe("open");
  });

  it("calls onEvent for each incoming live-event and never crashes on a malformed one", () => {
    const onEvent = vi.fn();
    renderHook(() => useLiveSession("session-1", { isLive: true, onEvent }));

    const source = MockEventSource.instances[0];
    act(() =>
      source.emit("live-event", {
        id: "e1",
        eventType: "SYNTHETIC_TICK",
        timestamp: "2026-01-01T00:00:00Z",
        sessionId: "s",
        sportId: "f1",
        source: "test",
        payload: {},
      }),
    );
    expect(onEvent).toHaveBeenCalledTimes(1);

    // Malformed payload — must not throw or call onEvent again.
    act(() => source.listeners["live-event"]?.forEach((cb) => cb({ data: "not json" })));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it("freshness is never LIVE for a session that isn't actually live, even with fresh events arriving", () => {
    const { result } = renderHook(() => useLiveSession("session-1", { isLive: false }));
    act(() => MockEventSource.instances[0].emit("live-event", { timestamp: new Date().toISOString() }));
    expect(result.current.freshness.state).toBe("offline");
  });

  it("freshness becomes LIVE once a fresh event arrives for a live session", () => {
    const { result } = renderHook(() => useLiveSession("session-1", { isLive: true }));
    expect(result.current.freshness.state).toBe("offline"); // nothing received yet

    act(() => MockEventSource.instances[0].emit("live-event", { timestamp: new Date().toISOString() }));
    expect(result.current.freshness.state).toBe("live");
  });

  it("seeds freshness from initialLastEventAt before any SSE event arrives", () => {
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { result } = renderHook(() => useLiveSession("session-1", { isLive: true, initialLastEventAt: staleTimestamp }));
    expect(result.current.freshness.state).toBe("offline"); // stale beyond the delayed threshold
    expect(result.current.freshness.updatedAt).toBe(staleTimestamp);
  });

  it("reconnects after an error, after the configured backoff delay", () => {
    vi.useFakeTimers();
    renderHook(() => useLiveSession("session-1", { isLive: true }));
    expect(MockEventSource.instances).toHaveLength(1);

    act(() => MockEventSource.instances[0].triggerError());
    expect(MockEventSource.instances[0].closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(1); // not reconnected yet

    act(() => vi.advanceTimersByTime(__TESTING__.RECONNECT_DELAY_MS));
    expect(MockEventSource.instances).toHaveLength(2); // a fresh EventSource was opened
  });

  it("reports connectionState 'closed' immediately on error, before the reconnect fires", () => {
    const { result } = renderHook(() => useLiveSession("session-1", { isLive: true }));
    act(() => MockEventSource.instances[0].emit("ready"));
    expect(result.current.connectionState).toBe("open");

    act(() => MockEventSource.instances[0].triggerError());
    expect(result.current.connectionState).toBe("closed");
  });

  it("closes the EventSource and cancels any pending reconnect on unmount", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useLiveSession("session-1", { isLive: true }));
    const source = MockEventSource.instances[0];
    act(() => source.triggerError()); // schedules a reconnect

    unmount();
    expect(source.closed).toBe(true);

    act(() => vi.advanceTimersByTime(__TESTING__.RECONNECT_DELAY_MS * 2));
    expect(MockEventSource.instances).toHaveLength(1); // no reconnect after unmount
  });

  it("closes the previous EventSource and opens a new one when sessionId changes", () => {
    const { rerender } = renderHook(({ id }) => useLiveSession(id, { isLive: true }), {
      initialProps: { id: "session-1" },
    });
    const first = MockEventSource.instances[0];

    act(() => rerender({ id: "session-2" }));

    expect(first.closed).toBe(true);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].url).toContain("session-2");
  });

  it("does not open a connection when sessionId is null", () => {
    renderHook(() => useLiveSession(null, { isLive: false }));
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
