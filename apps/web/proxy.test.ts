import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

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
