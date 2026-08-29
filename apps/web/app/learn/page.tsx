import type { Metadata } from "next";
import { apiGet } from "../../lib/api";
import { buildPageMetadata } from "../../lib/pageMetadata";
import { LearnGrid } from "./LearnGrid";
import styles from "./page.module.css";

export const metadata: Metadata = buildPageMetadata({
  path: "/learn",
  title: "Learn F1",
  description:
    "Plain-language explanations for F1 rules, flags, and race situations — built for following live sessions.",
});

interface ConceptSummary {
  slug: string;
  title: string;
  difficulty: string;
  shortExplanation: string;
}

async function getF1Concepts(): Promise<{ concepts: ConceptSummary[]; unavailable: boolean }> {
  try {
    const { concepts } = await apiGet<{ concepts: ConceptSummary[] }>("/api/education/f1/concepts");
    return { concepts, unavailable: false };
  } catch {
    return { concepts: [], unavailable: true };
  }
}

/** The Formula 1 glossary as a standalone companion to contextual explanations. */
export default async function LearnPage() {
  const { concepts, unavailable } = await getF1Concepts();
  const beginnerCount = concepts.filter((concept) => concept.difficulty.toLowerCase() === "beginner").length;

  return (
    <>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>The race, decoded</span>
          <h1 className={styles.title}>Learn F1</h1>
          <p className={styles.lede}>
            Plain-language explanations for the things that happen live. Start with the basics or quickly find the rule,
            flag, or race situation you just saw.
          </p>
        </div>
        {concepts.length > 0 && (
          <dl className={styles.librarySummary} aria-label="Learning library summary">
            <div>
              <dt>Topics</dt>
              <dd>{concepts.length}</dd>
            </div>
            <div>
              <dt>Start here</dt>
              <dd>{beginnerCount} beginner</dd>
            </div>
          </dl>
        )}
      </header>
      {concepts.length === 0 ? (
        <section className={styles.emptyState} aria-labelledby="learn-empty-title">
          <h2 id="learn-empty-title">{unavailable ? "Learning library unavailable" : "Learning library is empty"}</h2>
          <p>
            {unavailable
              ? "We couldn't load the F1 explainers right now. Try this page again in a moment."
              : "No F1 explainers have been published yet."}
          </p>
          <a href="/learn" className={styles.retryLink}>
            Try again
          </a>
        </section>
      ) : (
        <LearnGrid concepts={concepts} />
      )}
    </>
  );
}
