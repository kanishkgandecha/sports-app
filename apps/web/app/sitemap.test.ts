import { afterEach, describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

function fixture(overrides: Partial<{ id: string; detailAvailable: boolean }> = {}) {
  return {
    id: "f1-meeting-1",
    slug: "test-grand-prix-1",
    name: "Test Grand Prix",
    status: "completed",
    startTime: "2026-05-01T13:00:00.000Z",
    venue: { id: "f1-circuit-1", name: "Test Circuit", country: "Testland", timezone: "+00:00" },
    detailAvailable: true,
    ...overrides,
  };
}

describe("sitemap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("always includes the core static routes with absolute URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ fixtures: [] }), { status: 200 })),
    );
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000");
    expect(urls).toContain("http://localhost:3000/sports/f1");
    expect(urls).toContain("http://localhost:3000/archive");
    expect(urls).toContain("http://localhost:3000/learn");
  });

  it("includes an event page only for fixtures with real, detailed content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              fixtures: [
                fixture({ id: "f1-meeting-available", detailAvailable: true }),
                fixture({ id: "f1-meeting-summary-only", detailAvailable: false }),
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain("http://localhost:3000/events/f1-meeting-available");
    expect(urls).not.toContain("http://localhost:3000/events/f1-meeting-summary-only");
  });

  it("never includes the technical /health route", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ fixtures: [] }), { status: 200 })),
    );
    const entries = await sitemap();
    expect(entries.map((entry) => entry.url)).not.toContain("http://localhost:3000/health");
  });

  it("falls back to the static routes when the fixtures API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.url)).toContain("http://localhost:3000/archive");
  });
});
