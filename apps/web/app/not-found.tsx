import Link from "next/link";
import styles from "./events/[id]/eventState.module.css";

/**
 * Phase 5 finding: with no root `not-found.tsx`, an unmatched URL fell
 * through to Next's own built-in default 404 boilerplate. That boilerplate
 * ships its own styled-jsx, generated at build time with no way to attach
 * this app's per-request CSP nonce — real browser QA caught it blocked
 * outright (`style-src` has no `unsafe-inline`), leaving the page's own
 * "404 / This page could not be found" heading completely unstyled. Root
 * layout (nav, skip link) still rendered and hydrated correctly around it;
 * only Next's own fallback content was affected — see docs/CONTEXT.md's
 * Phase 5 checkpoint.
 *
 * A real page here, sharing the same on-brand `eventState.module.css`
 * language `/events/[id]/not-found.tsx` already uses, replaces that
 * built-in fallback entirely: it renders through this app's own dynamic
 * root layout, so it gets a real nonce like every other route, and reads
 * consistently with the rest of the product instead of a bare, generic
 * "404" heading. Next auto-injects `noindex, nofollow` for this boundary
 * (verified over curl in Phase 3), so no metadata export is needed here —
 * matching the sibling event-scoped not-found.tsx's convention.
 */
export default function NotFound() {
  return (
    <div className={styles.state}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.message}>There&apos;s nothing at this address.</p>
      <Link href="/" className={styles.action}>
        Back home
      </Link>
    </div>
  );
}
