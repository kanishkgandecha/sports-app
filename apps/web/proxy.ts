import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_API_ORIGIN } from "./lib/api";
import { buildContentSecurityPolicy, buildStaticSecurityHeaders } from "./lib/securityHeaders";

/**
 * Phase 4 (web hardening) — Next.js 16 renamed the `middleware.ts`
 * convention to `proxy.ts` (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md);
 * this is that convention's home, not a reverse proxy in the traditional
 * sense.
 *
 * Generates a fresh CSP nonce per request and sets Content-Security-Policy
 * on both the request and the response, following Next's documented
 * pattern (node_modules/next/dist/docs/.../content-security-policy.md):
 * setting it on the *request* headers lets Next's renderer read the nonce
 * back out and auto-apply it to its own framework-generated inline
 * scripts/styles (RSC streaming payloads, hydration bootstrap), so this
 * file never has to enumerate every place Next itself emits inline
 * content. This requires dynamic rendering to work — every route that
 * actually needs it (`/`, `/archive`, `/events/[id]`, `/learn`,
 * `/sports/f1`) already renders dynamically (each fetches with
 * `cache: "no-store"` — see lib/api.ts), confirmed in `pnpm build`'s route
 * table (`ƒ`, not `○`). A completely unmatched URL used to fall through to
 * Next's own built-in, statically-generated 404 boilerplate — no nonce
 * exists to embed into prebuilt HTML, so its styled-jsx was CSP-blocked
 * (confirmed by real browser QA, not just curl, in Phase 5). Fixed by
 * `app/not-found.tsx`, a real page in this app's own dynamic root layout —
 * see that file's doc comment.
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildContentSecurityPolicy({ nonce, isDev, apiOrigin: browserApiOrigin() });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const [key, value] of buildStaticSecurityHeaders()) response.headers.set(key, value);
  return response;
}

/** PUBLIC_API_ORIGIN is documented as already being a bare origin, but this
 * guards against a misconfigured value (trailing slash, accidental path)
 * turning into an invalid CSP source rather than a hard failure. */
function browserApiOrigin(): string {
  try {
    return new URL(PUBLIC_API_ORIGIN).origin;
  } catch {
    return "http://localhost:4000";
  }
}

// Run on every page request except static assets, Next's own
// prefetch-only requests, and the two non-HTML metadata endpoints, matching
// the matcher Next's CSP guide recommends plus this app's own exclusions —
// none of these ever render HTML, so they need neither a nonce nor these
// headers.
//
// Phase 6 — robots.txt and sitemap.xml added to the exclusion after real
// browser QA (Phase 5) found Chromium's own built-in raw-XML viewer
// injecting an unrelated internal stylesheet into /sitemap.xml, which this
// CSP correctly blocked (2 console errors; the sitemap's actual XML content
// was unaffected — a real crawler parses the response body, it doesn't
// render it in a browser). Confirmed security-neutral before excluding:
// `X-Content-Type-Options: nosniff` (still set on every other route) is the
// header that actually prevents content-type confusion, not CSP; these two
// routes are Next metadata-route handlers that only ever serve deterministic
// XML/text built from this app's own database, never third-party or
// user-controlled input, so there is no injectable content for a CSP to
// guard against here. Static application routes keep the full CSP and
// security-header set unchanged.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
