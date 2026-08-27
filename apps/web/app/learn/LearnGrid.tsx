"use client";

import { useMemo, useState } from "react";
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
  const [query, setQuery] = useState("");
  const [difficulty, setDifficulty] = useState("all");
  const difficulties = useMemo(
    () => [...new Set(concepts.map((concept) => concept.difficulty.toLowerCase()))],
    [concepts],
  );
  const filteredConcepts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return concepts.filter((concept) => {
      const matchesDifficulty = difficulty === "all" || concept.difficulty.toLowerCase() === difficulty;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        concept.title.toLowerCase().includes(normalizedQuery) ||
        concept.shortExplanation.toLowerCase().includes(normalizedQuery);
      return matchesDifficulty && matchesQuery;
    });
  }, [concepts, difficulty, query]);

  function clearFilters() {
    setQuery("");
    setDifficulty("all");
  }

  return (
    <>
      <section className={styles.library} aria-labelledby="concept-library-title">
        <div className={styles.libraryHeader}>
          <div>
            <span className={styles.kicker}>Browse the glossary</span>
            <h2 id="concept-library-title" className={styles.libraryTitle}>
              Find an explainer
            </h2>
          </div>
          <p className={styles.resultCount} role="status" aria-live="polite">
            Showing {filteredConcepts.length} of {concepts.length} topics
          </p>
        </div>

        <div className={styles.controls}>
          <div className={styles.searchField}>
            <label htmlFor="learn-search">Search topics</label>
            <input
              id="learn-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try “Safety Car”"
              autoComplete="off"
            />
          </div>
          <fieldset className={styles.filterGroup}>
            <legend>Difficulty</legend>
            <div className={styles.filterButtons}>
              {["all", ...difficulties].map((option) => (
                <button
                  key={option}
                  type="button"
                  className={styles.filterButton}
                  aria-pressed={difficulty === option}
                  onClick={() => setDifficulty(option)}
                >
                  {option === "all" ? "All levels" : option}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {filteredConcepts.length === 0 ? (
          <div className={styles.noResults}>
            <h3>No explainers match</h3>
            <p>Try a broader search or show every difficulty level.</p>
            <button type="button" className={styles.resetButton} onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        ) : (
          <div className={styles.grid}>
            {filteredConcepts.map((concept) => (
              <button
                key={concept.slug}
                type="button"
                className={styles.card}
                onClick={() => setOpenSlug(concept.slug)}
              >
                <span className={styles.difficulty}>{concept.difficulty}</span>
                <span className={styles.cardTitle}>{concept.title}</span>
                <p className={styles.cardBody}>{concept.shortExplanation}</p>
                <span className={styles.cardAction}>
                  Open explainer <span aria-hidden="true">→</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {openSlug && <GlossaryDrawer slug={openSlug} onClose={() => setOpenSlug(null)} onNavigate={setOpenSlug} />}
    </>
  );
}
