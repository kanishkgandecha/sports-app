"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../../lib/api";
import styles from "./f1EventCenter.module.css";

interface ConceptDetail {
  concept: { slug: string; title: string; detailExplanation: string };
  related: { slug: string; title: string }[];
  precededBy: { slug: string; title: string }[];
  followedBy: { slug: string; title: string }[];
}

/**
 * The one drawer instance the whole Event Center shares — opened with a
 * concept slug from anywhere (the "New to F1?" entry point, a race-control
 * message's "What does this mean?" chip). Dismissible (Esc, overlay click,
 * close button), never blocks the live view underneath it, and never
 * auto-opens (Checkpoint 5 §12 — education must never interrupt someone who
 * already understands F1).
 */
export function GlossaryDrawer({ slug, onClose, onNavigate }: { slug: string; onClose: () => void; onNavigate: (slug: string) => void }) {
  const [data, setData] = useState<ConceptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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
  }, [slug]);

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
  const related = data
    ? [...new Map([...data.followedBy, ...data.related].map((c) => [c.slug, c])).values()].slice(0, 4)
    : [];

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className={styles.drawerOverlay} onClick={onClose} aria-hidden="true" />
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label="Concept explanation">
        <button type="button" className={styles.drawerClose} onClick={onClose}>
          Close
        </button>
        {loading && <p className={styles.drawerBody}>Loading…</p>}
        {error && <p className={styles.drawerBody}>Couldn&apos;t load this explanation right now.</p>}
        {data && (
          <>
            <h2 className={styles.drawerTitle}>{data.concept.title}</h2>
            <p className={styles.drawerBody}>{data.concept.detailExplanation}</p>
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
