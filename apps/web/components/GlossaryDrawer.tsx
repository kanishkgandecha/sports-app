"use client";

import { useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api";
import styles from "./sharedEventCenter.module.css";

interface ConceptDetail {
  concept: { slug: string; title: string; detailExplanation: string };
  related: { slug: string; title: string }[];
  precededBy: { slug: string; title: string }[];
  followedBy: { slug: string; title: string }[];
}

const INTERNAL_CONCEPT_LINK = /\[([^\]]+)\]\(#([a-z0-9-]+)\)/g;

function renderExplanation(text: string, onNavigate: (slug: string) => void) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INTERNAL_CONCEPT_LINK)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <button
        key={`${match[2]}-${index}`}
        type="button"
        className={styles.drawerInlineLink}
        onClick={() => onNavigate(match[2])}
      >
        {match[1]}
      </button>,
    );
    cursor = index + match[0].length;
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
}

/**
 * The one drawer instance any Event Center shares — opened with a concept
 * slug from anywhere (an "Explain this" entry point, a live-feed message's
 * "What does this mean?" chip). Dismissible (Esc, overlay click, close
 * button), never blocks the live view underneath it, and never auto-opens
 * (Checkpoint 5 §12 — education must never interrupt someone who already
 * understands the sport).
 */
export function GlossaryDrawer({
  slug,
  onClose,
  onNavigate,
}: {
  slug: string;
  onClose: () => void;
  onNavigate: (slug: string) => void;
}) {
  const [data, setData] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Checkpoint 7 (keyboard accessibility) — a dialog that opens without
  // moving focus into it, and never gives it back, is a real trap for a
  // keyboard/screen-reader user: focus stays on (or is lost from) whatever
  // was behind the drawer. On open, move focus to the close button (the
  // one control guaranteed to exist regardless of loading/error/data
  // state); on close, restore it to whatever had focus before the drawer
  // opened (the EducationTrigger that opened it) — not just "somewhere,"
  // the actual origin, since a Tab from there should resume exactly where
  // the user left off.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    return () => previouslyFocused?.focus();
    // Intentionally only on mount/unmount, not on `slug` change — the
    // drawer instance persists across in-drawer "related concept"
    // navigation (onNavigate), which must NOT re-trigger this and steal
    // focus back to the close button mid-read.
  }, []);

  // Minimal, scoped Tab-wrap for this one drawer — not a generic reusable
  // focus-trap abstraction (deliberately: this checkpoint's own "do not
  // over-engineer accessibility abstractions" rule). Only Tab/Shift+Tab at
  // the two ends of the drawer's own focusable set wrap around; Escape
  // (below) still closes exactly as before.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Tab" || !drawerRef.current) return;
    const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
      'button, [href], [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    apiGet<ConceptDetail>(`/api/education/concepts/${slug}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, retryKey]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // A concept can appear in both `followedBy` and `related` (e.g. "grand-
  // prix" following "what-is-f1" while also being generically related) —
  // deduped by slug, found via a real-browser check flagging a duplicate
  // React key (Checkpoint 5, docs/CONTEXT.md §10).
  const inlineConceptSlugs = new Set(
    data ? [...data.concept.detailExplanation.matchAll(INTERNAL_CONCEPT_LINK)].map((match) => match[2]) : [],
  );
  const related = data
    ? [...new Map([...data.followedBy, ...data.related].map((c) => [c.slug, c])).values()]
        .filter((concept) => !inlineConceptSlugs.has(concept.slug))
        .slice(0, 4)
    : [];

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} aria-hidden="true" />
      {/* The dialog owns a scoped Tab focus trap; keyboard handling belongs on this semantic container. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
      <aside
        ref={drawerRef}
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-label="Concept explanation"
        onKeyDown={handleKeyDown}
      >
        <button type="button" ref={closeButtonRef} className={styles.drawerClose} onClick={onClose}>
          Close
        </button>
        {loading && <p className={styles.drawerBody}>Loading…</p>}
        {error && (
          <div className={styles.drawerError} role="alert">
            <p className={styles.drawerBody}>Couldn&apos;t load this explanation right now.</p>
            <button type="button" className={styles.drawerRetry} onClick={() => setRetryKey((value) => value + 1)}>
              Try again
            </button>
          </div>
        )}
        {data && (
          <>
            <h2 className={styles.drawerTitle}>{data.concept.title}</h2>
            <p className={styles.drawerBody}>{renderExplanation(data.concept.detailExplanation, onNavigate)}</p>
            {related.length > 0 && (
              <div className={styles.drawerRelated}>
                <span className={styles.drawerRelatedLabel}>Related</span>
                {related.map((c) => (
                  <button
                    key={c.slug}
                    type="button"
                    className={styles.drawerRelatedButton}
                    onClick={() => onNavigate(c.slug)}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}

/** The small, subtle "what does this mean?" trigger — never a large permanently-visible explanation (§12). */
export function EducationTrigger({ label, onOpen }: { label: string; onOpen: () => void }) {
  return (
    <button type="button" className={styles.educationTrigger} onClick={onOpen}>
      {label}
    </button>
  );
}
