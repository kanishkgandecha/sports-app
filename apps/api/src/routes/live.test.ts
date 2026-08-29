import { describe, expect, it, vi } from "vitest";
import { parseCursor, corsHeadersFor, disableIdleTimeout } from "./live";

describe("SSE resume cursor validation", () => {
  it("treats an absent cursor as a new subscription", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor("")).toBeNull();
  });

  it("accepts zero and arbitrarily large integer cursors without number precision loss", () => {
    expect(parseCursor("0")).toBe(0n);
    expect(parseCursor("900719925474099312345")).toBe(900719925474099312345n);
  });

  it.each(["-1", "1.5", "01", "abc"])("rejects malformed cursor %s", (cursor) => {
    expect(parseCursor(cursor)).toBe("invalid");
  });

  it("rejects duplicate cursor headers", () => {
    expect(parseCursor(["1", "2"])).toBe("invalid");
  });
});

/**
 * Phase 6 regression — the SSE stream writes straight to `reply.raw`,
 * bypassing `@fastify/cors` entirely (that plugin never runs for a
 * response that skips Fastify's normal reply lifecycle). Real-browser
 * verification against a genuinely live session (Phase 5 had none to test
 * with) found this left the stream with no CORS header at all, silently
 * blocking every browser client — a `curl` check never catches this,
 * which is exactly how it went unnoticed. `corsHeadersFor` is the fix;
 * these tests pin its allowlist behavior directly.
 */
describe("corsHeadersFor", () => {
  const allowed = ["http://localhost:3000", "https://example.com"];

  it("reflects an allowed origin, with Vary: Origin", () => {
    expect(corsHeadersFor("http://localhost:3000", allowed)).toEqual({
      "Access-Control-Allow-Origin": "http://localhost:3000",
      Vary: "Origin",
    });
  });

  it("sets no header at all for an origin that isn't on the allowlist", () => {
    expect(corsHeadersFor("https://evil.example", allowed)).toEqual({});
  });

  it("sets no header when there is no Origin header (same-origin or non-browser request)", () => {
    expect(corsHeadersFor(undefined, allowed)).toEqual({});
  });

  it("never reflects an origin verbatim without checking the allowlist first", () => {
    expect(corsHeadersFor("http://localhost:3000", [])).toEqual({});
  });
});

/**
 * Phase 6 regression — Fastify's global `connectionTimeout: 10_000`
 * (apps/api/src/app.ts) is shorter than this file's 15-second SSE
 * heartbeat, so Node was silently killing every stream socket on its own
 * ~10-second idle timer, well before a heartbeat could keep it alive.
 * Real-browser verification against a genuinely live session caught it as
 * a repeating `net::ERR_INCOMPLETE_CHUNKED_ENCODING` / reconnect cycle —
 * not reproducible with `curl` or `app.inject()`, both of which finish
 * long before 10 seconds of idle time could ever elapse. This only pins
 * that the stream handler calls `setTimeout(0)` on its socket at all; the
 * timeout itself needs a real held-open connection to reproduce (see
 * live.integration.test.ts and docs/CONTEXT.md's Phase 6 checkpoint).
 */
describe("disableIdleTimeout", () => {
  it("disables the socket's idle timeout", () => {
    const socket = { setTimeout: vi.fn() };
    disableIdleTimeout(socket);
    expect(socket.setTimeout).toHaveBeenCalledWith(0);
  });

  it("does nothing (never throws) when there is no socket", () => {
    expect(() => disableIdleTimeout(null)).not.toThrow();
    expect(() => disableIdleTimeout(undefined)).not.toThrow();
  });
});
