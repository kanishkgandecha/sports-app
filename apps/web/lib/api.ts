/**
 * Checkpoint 7 (Docker) — the API is reachable at two *different* origins
 * depending on where this code runs, and conflating them silently breaks
 * one or the other the moment this app runs in Docker:
 *
 *  - In the **browser**, only `NEXT_PUBLIC_*` vars exist (inlined into the
 *    client bundle at build time) — this must be an origin the user's own
 *    browser can reach, e.g. the host's published port
 *    (`http://localhost:4000`), never the Docker-internal service name.
 *  - On the **server** (Server Components, route handlers — this file's
 *    `apiGet` is called from both `apps/web/app/page.tsx` and every client
 *    component), the *container* is what's making the request. Inside
 *    Docker Compose, `http://localhost:4000` from the `web` container
 *    means "the web container itself," not the `api` service — it has to
 *    reach the API via the Compose network's service DNS name instead
 *    (`http://api:4000`). `API_INTERNAL_URL` is deliberately **not**
 *    `NEXT_PUBLIC_`-prefixed so it stays a plain runtime env var (readable
 *    without a rebuild) rather than a build-time-inlined one.
 *
 * Outside Docker (plain `pnpm dev`), neither var is set, both branches
 * fall back to the same `http://localhost:4000`, and this is a no-op —
 * see docs/CONTEXT.md, Checkpoint 7 §4/§11 for how this was found (a real
 * Docker run, not inspection alone).
 */
const isServer = typeof window === "undefined";
export const API_BASE_URL = isServer
  ? (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000")
  : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

/**
 * Phase 4 (launch-readiness) — the *browser*-reachable API origin, always
 * `NEXT_PUBLIC_API_URL` regardless of where this constant is read from.
 *
 * Used only by proxy.ts to build the CSP `connect-src` list, which governs
 * what the browser is permitted to fetch — never `API_BASE_URL`'s
 * server-side branch, which can resolve to the Docker-internal
 * `API_INTERNAL_URL` (e.g. `http://api:4000`), an origin the browser can
 * neither reach nor should be told to trust.
 */
export const PUBLIC_API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    // Status carried on the error so callers can tell "genuinely not
    // found" (404) apart from "the API is unreachable/erroring" (anything
    // else) — see apps/web/app/events/[id]/page.tsx, which renders a
    // different state for each rather than treating every failure as 404.
    throw new ApiError(`GET ${path} failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}
