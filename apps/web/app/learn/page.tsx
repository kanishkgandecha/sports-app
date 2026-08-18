import type { Metadata } from "next";
import { apiGet } from "../../lib/api";
import { LearnGrid } from "./LearnGrid";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Learn — Sports Platform" };

interface ConceptSummary {
  slug: string;
  title: string;
  difficulty: string;
  shortExplanation: string;
}

async function getF1Concepts(): Promise<ConceptSummary[]> {
  try {
    const { concepts } = await apiGet<{ concepts: ConceptSummary[] }>("/api/education/f1/concepts");
    return concepts;
  } catch {
    return [];
  }
}

/**
 * The glossary, as its own destination — not just contextual chips inside
 * a live session. F1-only today (the only sport with real seeded
 * content); this page reads whatever `/api/education/:sport/concepts`
 * actually has, so a future Cricket concept set appears here automatically
 * once it exists, with no page-level code change.
 */
export default async function LearnPage() {
  const concepts = await getF1Concepts();

  return (
    <>
      <h1 className={styles.title}>Learn</h1>
      <p className={styles.lede}>
        Plain-language explanations for the things that happen live — browse them here, or tap
        &quot;What does this mean?&quot; wherever they come up during a session.
      </p>
      {concepts.length === 0 ? (
        <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>
          No concepts loaded — start the API (see README) to populate this from the education
          content in content/education/.
        </p>
      ) : (
        <LearnGrid concepts={concepts} />
      )}
    </>
  );
}
