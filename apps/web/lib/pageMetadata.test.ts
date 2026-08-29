import { describe, expect, it } from "vitest";
import { buildPageMetadata } from "./pageMetadata";

describe("buildPageMetadata", () => {
  it("builds an absolute canonical URL from SITE_URL and the given path", () => {
    const metadata = buildPageMetadata({ path: "/archive", title: "T", description: "D" });
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/archive");
  });

  it("reuses the same title/description across the plain title, Open Graph, and Twitter fields", () => {
    const metadata = buildPageMetadata({ path: "/learn", title: "Learn F1", description: "Plain-language F1." });
    expect(metadata.title).toBe("Learn F1");
    expect(metadata.description).toBe("Plain-language F1.");
    expect(metadata.openGraph).toMatchObject({
      title: "Learn F1",
      description: "Plain-language F1.",
      url: "http://localhost:3000/learn",
      type: "website",
      siteName: "F1 Race Center",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: "Learn F1", description: "Plain-language F1." });
  });
});
