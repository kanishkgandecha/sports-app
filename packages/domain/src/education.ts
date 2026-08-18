/**
 * Education domain model — a relationship layer over Markdown/MDX content,
 * not just rendered prose. See ARCHITECTURE.md §6.
 */

export type EducationDifficulty = "beginner" | "intermediate" | "advanced";

export interface EducationConcept {
  slug: string;
  title: string;
  sport: string | null;
  difficulty: EducationDifficulty;
  shortExplanation: string;
  detailExplanation: string;
  relatedConceptSlugs: string[];
  relatedEventTypes: string[];
  /** "Why did this happen?" — concept(s) that typically precede this one. */
  precededBy: string[];
  /** "What happens next?" — concept(s) that typically follow this one. */
  followedBy: string[];
}
