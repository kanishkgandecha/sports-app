import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConcepts } from "./loader";
import { EducationIndex } from "./resolve";

const here = dirname(fileURLToPath(import.meta.url));
// packages/education/src -> repo root -> content/education
const contentRoot = join(here, "../../../content/education");

describe("loadConcepts", () => {
  it("parses every seeded F1 concept", () => {
    const concepts = loadConcepts(contentRoot);
    const slugs = concepts.map((c) => c.slug);
    expect(slugs).toContain("safety-car");
    expect(slugs).toContain("vsc");
    expect(slugs).toContain("what-is-f1");
  });
});

describe("EducationIndex", () => {
  const index = new EducationIndex(loadConcepts(contentRoot));

  it("resolves contextual help from a live event type", () => {
    // Several concepts intentionally share the SAFETY_CAR event type — the
    // LiveEvent vocabulary (master brief §11) has one SAFETY_CAR event type
    // covering safety car / VSC / red flag, distinguished by payload, not
    // by event type. Contextual help should surface all of them.
    const concepts = index.forEventType("SAFETY_CAR").map((c) => c.slug);
    expect(concepts).toEqual(expect.arrayContaining(["safety-car", "vsc", "red-flag"]));
  });

  it("chains 'why did this happen' via precededBy", () => {
    const preceding = index.precededBy("safety-car");
    expect(preceding.map((c) => c.slug)).toContain("what-is-a-flag");
  });

  it("chains 'what happens next' via followedBy", () => {
    const next = index.followedBy("safety-car");
    expect(next.map((c) => c.slug)).toContain("safety-car-restart");
  });

  it("resolves related concepts", () => {
    const related = index.related("safety-car");
    expect(related.map((c) => c.slug)).toEqual(expect.arrayContaining(["vsc", "red-flag"]));
  });
});
