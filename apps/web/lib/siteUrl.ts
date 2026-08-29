/**
 * Phase 4 (launch-readiness) — this app's own public origin, used to build
 * absolute canonical/Open Graph URLs and the sitemap.
 *
 * No canonical-origin config existed anywhere in the repo before this: the
 * only prior origin config was NEXT_PUBLIC_API_URL/API_INTERNAL_URL (the
 * *API's* origin — see lib/api.ts), never this app's own.
 *
 * Unlike NEXT_PUBLIC_API_URL (baked into the client bundle at build time,
 * because the browser needs it), SITE_URL is only ever read from server-side
 * code — generateMetadata, app/robots.ts, app/sitemap.ts all run on the
 * server only — so a plain runtime env var (changeable without a rebuild)
 * is the right shape, matching API_INTERNAL_URL's precedent rather than
 * NEXT_PUBLIC_API_URL's.
 *
 * The http://localhost:3000 fallback matches this app's own default port,
 * so plain `pnpm dev` and the local Compose setup both produce correct
 * absolute URLs with zero configuration. A real deployment sets SITE_URL
 * explicitly; see .env.example.
 */
export const SITE_URL = (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
