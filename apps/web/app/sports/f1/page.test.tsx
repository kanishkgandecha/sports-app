import { describe, expect, it } from "vitest";
import { metadata } from "./page";
import { metadata as rootMetadata } from "../../page";

/**
 * Phase 6 regression — `/sports/f1` previously rendered a doubled title
 * ("F1 Race Center — F1 Race Center") because a plain string `title` picks
 * up the root layout's `template` on this nested segment, while the
 * identical object rendered correctly on `/` (the same segment as the
 * layout defining the template, where the template never applies — see
 * page.tsx's doc comment). `title: { absolute }` fixes both.
 */
describe("/sports/f1 metadata", () => {
  it("uses an absolute title so no parent template can double it", () => {
    expect(metadata.title).toEqual({ absolute: "F1 Race Center" });
  });

  it("canonicalizes to the root — / and /sports/f1 render identical content and share one canonical target", () => {
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/");
  });

  it("has a description and a correct Open Graph/Twitter block", () => {
    expect(metadata.description).toBeTruthy();
    expect(metadata.openGraph).toMatchObject({
      title: "F1 Race Center",
      url: "http://localhost:3000/",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: "F1 Race Center" });
  });

  it("is the exact object re-exported by app/page.tsx for /", () => {
    expect(rootMetadata).toBe(metadata);
  });
});
