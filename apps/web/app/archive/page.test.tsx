import { describe, expect, it } from "vitest";
import { metadata } from "./page";

/** Phase 6 — /archive previously had only a bare title; pins the full canonical/OG/Twitter block. */
describe("/archive metadata", () => {
  it("has a distinct title, a description, and a correct canonical/Open Graph/Twitter block", () => {
    expect(metadata.title).toBe("F1 archive");
    expect(metadata.description).toBeTruthy();
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/archive");
    expect(metadata.openGraph).toMatchObject({ url: "http://localhost:3000/archive", type: "website" });
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });
});
