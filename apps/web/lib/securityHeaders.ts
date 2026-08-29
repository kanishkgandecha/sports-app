/**
 * Phase 4 (web hardening) — pure CSP/security-header construction, shared by
 * proxy.ts (which supplies a fresh per-request nonce) and this file's own
 * tests. Kept separate from proxy.ts so the actual policy is unit-testable
 * without NextRequest/NextResponse machinery.
 *
 * Inspected before writing this policy: apps/web has zero third-party
 * scripts, no <style>/styled-jsx blocks, no next/image remote patterns, no
 * external fonts (Big Shoulders is self-hosted via next/font — see
 * app/fonts.ts, no runtime font-CDN request), and no images at all yet (no
 * <img>/<Image>, no public/ dir — F1DriverRef.avatarUrl exists on the API
 * type but is never rendered). The one real external-facing runtime need is
 * API traffic: apiGet's fetch() and useLiveSession's EventSource both call
 * the Fastify API's browser-reachable origin (PUBLIC_API_ORIGIN — see
 * lib/api.ts), a different origin than this app's own when running in
 * Docker, so connect-src must allow it explicitly or every data fetch and
 * the live SSE stream would be silently blocked.
 *
 * Phase 5 correction: this original audit missed inline `style={{...}}`
 * *props* (as opposed to `<style>`/styled-jsx blocks) — real-browser QA
 * caught a dozen of them CSP-blocking at runtime across the archive,
 * `/sports/f1`, and every Event Center panel. Fixed at the call sites, not
 * by relaxing this policy: static values moved into CSS Modules classes;
 * genuinely dynamic values (bounded weekend session counts, and per-team
 * colors from provider data) moved into build-time-enumerated classes or a
 * scoped nonce'd `<style>` element (see TeamColorDot.tsx) — never
 * `unsafe-inline`/`unsafe-hashes`. style-src stays nonce-only.
 */

export interface SecurityHeadersOptions {
  /** Per-request nonce, so React/Next's own inline hydration and streaming
   * scripts can run under a strict CSP without falling back to
   * 'unsafe-inline' (see the Next.js CSP guide bundled in
   * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md). */
  nonce: string;
  /** True outside production — relaxes script-src for React's dev-only
   * eval-based error reconstruction. Neither React nor Next.js uses eval in
   * production (same doc, "Good to know" under Nonces). */
  isDev: boolean;
  /** Origin the browser needs to reach for API/SSE traffic, e.g.
   * "http://localhost:4000" — must be the browser-reachable origin
   * (PUBLIC_API_ORIGIN), never a Docker-internal one. */
  apiOrigin: string;
}

/** Builds the Content-Security-Policy header value. Requires a fresh nonce
 * per request — never cache or reuse this across requests. */
export function buildContentSecurityPolicy({ nonce, isDev, apiOrigin }: SecurityHeadersOptions): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    // data: for potential inline SVG/icon data URIs; no external image host
    // is in use today, so no third-party origin is listed.
    `img-src 'self' data:`,
    `font-src 'self'`,
    `connect-src 'self' ${apiOrigin}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    // No route embeds this app in a frame or embeds another site — see also
    // the X-Frame-Options: DENY set alongside this for browsers that don't
    // honor frame-ancestors.
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];
  return directives.join("; ");
}

/**
 * Headers that don't depend on a per-request nonce, so they're plain
 * key/value pairs rather than a template. Deliberately excludes:
 *
 * - X-XSS-Protection: obsolete. Modern guidance (OWASP, MDN) is to omit it
 *   entirely — the legacy browser auditor it controlled could itself be
 *   abused as an XSS vector, and CSP is the actual replacement.
 * - Strict-Transport-Security: this repo has no TLS-termination story yet
 *   (docs/SECURITY.md's "Open production work" lists a TLS review as
 *   unresolved) — adding it here would assert an HTTPS guarantee this app
 *   doesn't own. It belongs at whatever layer actually terminates TLS in a
 *   real deployment, not baked into the app unconditionally.
 */
export function buildStaticSecurityHeaders(): Array<[string, string]> {
  return [
    ["X-Content-Type-Options", "nosniff"],
    // Defense in depth alongside frame-ancestors 'none' above, for
    // browsers that only honor the older header.
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    // Every capability this product genuinely doesn't use. Extend this list
    // if a real feature (e.g. a share sheet) ever needs one of these.
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"],
  ];
}
