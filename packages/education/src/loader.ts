import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import type { EducationConcept, EducationDifficulty } from "@sports/domain";

/**
 * Reads every `*.md` file under `content/education/<sport>/` and parses it
 * into an EducationConcept. Frontmatter carries the relationship metadata;
 * the Markdown body is `detailExplanation`. See ARCHITECTURE.md §6 — this
 * is intentionally "files on disk", not a database table or a CMS.
 */
export function loadConcepts(contentRoot: string): EducationConcept[] {
  const concepts: EducationConcept[] = [];

  for (const sportDir of listDirs(contentRoot)) {
    const sportPath = join(contentRoot, sportDir);
    for (const file of readdirSync(sportPath).filter((f) => f.endsWith(".md"))) {
      const raw = readFileSync(join(sportPath, file), "utf8");
      const { data, content } = matter(raw);
      concepts.push(toConcept(sportDir, data, content));
    }
  }

  return concepts;
}

function listDirs(root: string): string[] {
  try {
    return readdirSync(root).filter((entry) => statSync(join(root, entry)).isDirectory());
  } catch {
    return [];
  }
}

function toConcept(
  sport: string,
  data: Record<string, unknown>,
  content: string,
): EducationConcept {
  const slug = String(data.slug ?? "");
  if (!slug) {
    throw new Error(`Education concept in sport "${sport}" is missing a "slug" in frontmatter`);
  }

  return {
    slug,
    title: String(data.title ?? slug),
    sport,
    difficulty: (data.difficulty as EducationDifficulty) ?? "beginner",
    shortExplanation: String(data.shortExplanation ?? ""),
    detailExplanation: content.trim(),
    relatedConceptSlugs: toStringArray(data.relatedConceptSlugs),
    relatedEventTypes: toStringArray(data.relatedEventTypes),
    precededBy: toStringArray(data.precededBy),
    followedBy: toStringArray(data.followedBy),
  };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}
