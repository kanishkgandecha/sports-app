import { afterEach, describe, expect, it, vi } from "vitest";
import { generateMetadata } from "./page";

function fixtureBody(overrides: Partial<{ id: string; name: string; status: string }> = {}) {
  return {
    fixture: {
      id: "f1-meeting-1292",
      slug: "dutch-grand-prix-2026-1292",
      name: "Dutch Grand Prix",
      status: "completed",
      startTime: "2026-08-23T13:00:00.000Z",
      venue: { id: "f1-circuit-55", name: "Circuit Zandvoort", country: "Netherlands", timezone: "+02:00" },
      detailAvailable: true,
      ...overrides,
    },
    sessions: [],
  };
}

describe("generateMetadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds title, description, canonical, Open Graph, and Twitter metadata for a completed event", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixtureBody()), { status: 200 })),
    );

    const metadata = await generateMetadata({ params: Promise.resolve({ id: "f1-meeting-1292" }) });

    expect(metadata.title).toBe("Dutch Grand Prix");
    expect(metadata.description).toMatch(/Results.*Dutch Grand Prix.*Circuit Zandvoort, Netherlands/);
    expect(metadata.alternates?.canonical).toBe("http://localhost:3000/events/f1-meeting-1292");
    expect(metadata.openGraph).toMatchObject({
      title: "Dutch Grand Prix",
      url: "http://localhost:3000/events/f1-meeting-1292",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary", title: "Dutch Grand Prix" });
    expect(metadata.robots).toBeUndefined();
  });

  it("describes a live event differently from a completed one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixtureBody({ status: "live" })), { status: 200 })),
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "f1-meeting-1292" }) });
    expect(metadata.description).toMatch(/^Live timing/);
  });

  it("describes an upcoming (scheduled) event with schedule-oriented copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixtureBody({ status: "scheduled" })), { status: 200 })),
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "f1-meeting-1292" }) });
    expect(metadata.description).toMatch(/^Schedule and session times/);
  });

  it("stays noindex for a genuinely missing fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "f1-meeting-does-not-exist" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.openGraph).toBeUndefined();
  });

  it("stays noindex for an id with an unrecognized prefix, without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "other-sport-match-1" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stays noindex rather than throwing when the API is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network error");
      }),
    );
    const metadata = await generateMetadata({ params: Promise.resolve({ id: "f1-meeting-1292" }) });
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
