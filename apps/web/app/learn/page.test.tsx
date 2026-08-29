import { describe, expect, it } from "vitest";
import { metadata } from "./page";

/** Phase 6 — /learn previously had only a bare title; pins the full canonical/OG/Twitter block. */
describe("/learn metadata", () => {
  it("has a distinct title, a description, and a correct canonical/Open Graph/Twitter block", () => {
    expect(metadata.title).toBe("Learn F1");
    expect(metadata.description).toBeTruthy();
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/learn");
    expect(metadata.openGraph).toMatchObject({ url: "http://localhost:3000/learn", type: "website" });
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});
