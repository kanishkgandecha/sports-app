"use client";

import { useId, useState } from "react";
import { apiGet } from "../lib/api";
import styles from "./ConceptChip.module.css";

interface ConceptResponse {
  concept: { title: string; shortExplanation: string; detailExplanation: string };
  followedBy: { slug: string; title: string }[];
}

/**
 * "What does this mean?" — the entry point required by master brief §1/§13.
 * Contextual, optional, and never blocking: it's a button next to whatever
 * live moment triggered it, not a modal the user has to dismiss. Checkpoint
 * 7 polish: moved off inline styles onto a real CSS module (real hover/
 * focus states, a respectful reveal transition), and the panel is now
 * properly associated with its trigger via `aria-controls`/`aria-expanded`
 * for screen readers, not just visually collapsed/expanded.
 */
export function ConceptChip({ slug, label }: { slug: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ConceptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const panelId = useId();

  async function handleToggle() {
    setOpen((v) => !v);
    if (!data && !loading) {
      setLoading(true);
      try {
        setData(await apiGet<ConceptResponse>(`/api/education/concepts/${slug}`));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <span className={styles.wrapper}>
      <button
        type="button"
        onClick={handleToggle}
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
      >
        {label} — what does this mean?
      </button>

      {open && (
        <div id={panelId} className={styles.panel} role="region" aria-label={`${label} explanation`}>
          {loading && "Loading…"}
          {data && (
            <>
              <strong className={styles.panelTitle}>{data.concept.title}</strong>
              {data.concept.shortExplanation}
              {data.followedBy.length > 0 && (
                <div className={styles.panelNext}>
                  What happens next: {data.followedBy.map((c) => c.title).join(", ")}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
