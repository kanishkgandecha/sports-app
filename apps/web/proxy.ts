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
 * table (`ƒ`, not `○`). The one exception is the framework's own global
 * `/_next/... 404` page for a URL matching no route at all, which Next
 * statically generates at build time — no nonce exists to embed into that
 * prebuilt HTML, so its own inline hydration script is (correctly, per this
 * CSP) blocked there; the page's server-rendered content still displays
 * (verified over curl), only that one already-broken-URL page loses
 * client-side hydration. Every real route in this product renders inside
 * `app/events/[id]`'s or another dynamic segment's tree and is unaffected
 * (confirmed: an unknown fixture id under `/events/*` already renders
 * through the dynamic route and gets a real nonce).
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

// Run on every page request except static assets and Next's own
// prefetch-only requests, matching the matcher Next's CSP guide
// recommends — those never render HTML, so they need neither a nonce nor
// these headers.
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
