import { resolve } from "node:path";
import { loadConcepts, EducationIndex } from "@sports/education";

function resolveContentRoot(): string {
  // apps/api runs with its own package dir as cwd (pnpm/turborepo default),
  // so the repo-root content/ directory is two levels up. Overridable for
  // any deployment layout that doesn't hold.
  return process.env.CONTENT_ROOT ?? resolve(process.cwd(), "../../content/education");
}

let cached: EducationIndex | undefined;

/** Loaded once per process. Content is version-controlled, not hot-edited in production. */
export function getEducationIndex(): EducationIndex {
  if (!cached) {
    cached = new EducationIndex(loadConcepts(resolveContentRoot()));
  }
  return cached;
}
