import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "./proxy";

// PUBLIC_API_ORIGIN (lib/api.ts) is a module-level constant resolved once
// from process.env.NEXT_PUBLIC_API_URL at import time, matching the
// existing API_BASE_URL pattern in the same file — env vars are fixed for
// the life of a running container/process in this app's deployment model,
// never re-read per request. That per-origin CSP construction is genuinely
// parameterized is already covered directly in securityHeaders.test.ts;
// this file only verifies proxy.ts wires that function up correctly against
// the resolved default (no NEXT_PUBLIC_API_URL set in the test process, so
// PUBLIC_API_ORIGIN falls back to http://localhost:4000 — see lib/api.ts).
describe("proxy", () => {
  it("sets a Content-Security-Policy header naming the resolved API origin", () => {
    const response = proxy(new NextRequest("http://localhost:3000/archive"));
    const csp = response.headers.get("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' http://localhost:4000");
  });

  it("uses a different nonce on every request", () => {
    const nonceOf = (res: ReturnType<typeof proxy>) =>
      res.headers.get("Content-Security-Policy")?.match(/nonce-([^']+)'/)?.[1];
    const first = nonceOf(proxy(new NextRequest("http://localhost:3000/")));
    const second = nonceOf(proxy(new NextRequest("http://localhost:3000/")));
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });

  it("sets the clickjacking, MIME-sniffing, and referrer headers alongside CSP", () => {
    const response = proxy(new NextRequest("http://localhost:3000/learn"));
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Permissions-Policy")).toContain("camera=()");
  });
});

/**
 * Phase 6 — robots.txt/sitemap.xml are non-HTML, deterministic,
 * database-only metadata endpoints; excluding them from the matcher
 * removed two console errors from Chromium's own built-in XML viewer
 * injecting a stylesheet this CSP correctly blocked (real crawlers are
 * unaffected either way — they parse the response body, not a browser
 * rendering of it). `proxy()` itself has no path logic — this exercises
 * the actual `source` regex Next compiles into its routing matcher, the
 * same string it uses at runtime, so a regression here is caught without
 * needing a full Next dev server.
 */
describe("proxy matcher", () => {
  const pattern = new RegExp(`^${config.matcher[0].source}$`);

  it("excludes the non-HTML metadata endpoints", () => {
    expect(pattern.test("/robots.txt")).toBe(false);
    expect(pattern.test("/sitemap.xml")).toBe(false);
  });

  it("still excludes static assets and the favicon", () => {
    expect(pattern.test("/_next/static/chunk.js")).toBe(false);
    expect(pattern.test("/_next/image")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });

  it("still matches every normal application route", () => {
    for (const path of ["/", "/archive", "/learn", "/sports/f1", "/events/f1-meeting-1292", "/health"]) {
      expect(pattern.test(path)).toBe(true);
    }
  });
});
