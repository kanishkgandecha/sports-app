"use client";

import { useState } from "react";
import { GlossaryDrawer } from "../../components/GlossaryDrawer";
import styles from "./page.module.css";

interface ConceptSummary {
  slug: string;
  title: string;
  difficulty: string;
  shortExplanation: string;
}

/**
 * Reuses the same `GlossaryDrawer` the F1 Event Center uses (it only ever
 * took a `slug`, never anything fixture/session-scoped) rather than
 * building a second drawer component for this page — one education
 * surface, not two independently-drifting ones.
 */
export function LearnGrid({ concepts }: { concepts: ConceptSummary[] }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  return (
    <>
      <div className={styles.grid}>
        {concepts.map((concept) => (
          <button
            key={concept.slug}
            type="button"
            className={styles.card}
            onClick={() => setOpenSlug(concept.slug)}
            style={{ textAlign: "left", font: "inherit", cursor: "pointer" }}
          >
            <span className={styles.difficulty}>{concept.difficulty}</span>
            <span className={styles.cardTitle}>{concept.title}</span>
            <p className={styles.cardBody}>{concept.shortExplanation}</p>
          </button>
        ))}
      </div>

      {openSlug && (
        <GlossaryDrawer slug={openSlug} onClose={() => setOpenSlug(null)} onNavigate={setOpenSlug} />
      )}
    </>
  );
}
