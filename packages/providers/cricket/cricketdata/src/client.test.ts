import { describe, expect, it, vi } from "vitest";
import { CricketDataFetchClient, CricketDataRequestError } from "./client";
import currentMatchesFixture from "./fixtures/currentMatches.json";
import invalidKeyFixture from "./fixtures/error.invalidKey.json";
import scorecardNotFound from "./fixtures/matchScorecard.notFound.json";
import bbbNotFound from "./fixtures/matchBbb.notFound.json";

function fakeFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (url: string | URL) => impl(String(url))) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("CricketDataFetchClient", () => {
  it("requires a real apiKey — refuses to construct with an empty one", () => {
    expect(() => new CricketDataFetchClient({ apiKey: "" })).toThrow();
  });

  it("returns the real currentMatches envelope on success", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(currentMatchesFixture));
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    const result = await client.getCurrentMatches();
    expect(result.status).toBe("success");
    expect(result.data.length).toBe(4);
  });

  it("sends the api key as a query parameter, never a header (verified real auth convention)", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn((url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedInit = init;
      return Promise.resolve(jsonResponse(currentMatchesFixture));
    }) as unknown as typeof fetch;
    const client = new CricketDataFetchClient({ apiKey: "real-key-123", fetchImpl });
    await client.getCurrentMatches();
    expect(capturedUrl).toContain("apikey=real-key-123");
    expect(capturedInit && "headers" in capturedInit ? capturedInit.headers : undefined).toBeUndefined();
  });

  it("throws CricketDataRequestError on the real invalid-key failure body — verified real, always HTTP 200", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(invalidKeyFixture, 200));
    const client = new CricketDataFetchClient({ apiKey: "bad-key", fetchImpl });
    await expect(client.getCurrentMatches()).rejects.toThrow(CricketDataRequestError);
    await expect(client.getCurrentMatches()).rejects.toThrow(/Invalid API Key/);
  });

  it("getMatchScorecard returns the real 'not found' failure body rather than throwing — verified real, common outcome", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(scorecardNotFound));
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    const result = await client.getMatchScorecard("e9d200fb-3c43-4852-9c93-9160517d7b36");
    expect(result.status).toBe("failure");
    expect(result.reason).toContain("not found");
  });

  it("getMatchBallByBall returns the real 'not able to get BBB' failure body rather than throwing", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(bbbNotFound));
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    const result = await client.getMatchBallByBall("e9d200fb-3c43-4852-9c93-9160517d7b36");
    expect(result.status).toBe("failure");
  });

  it("throws CricketDataRequestError on malformed JSON", async () => {
    const fetchImpl = fakeFetch(() => new Response("not json{{{", { status: 200 }));
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    await expect(client.getCurrentMatches()).rejects.toThrow(CricketDataRequestError);
  });

  it("throws CricketDataRequestError on a genuine non-200 (never observed real this checkpoint, but must not be swallowed)", async () => {
    const fetchImpl = fakeFetch(() => new Response("Internal Server Error", { status: 500 }));
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    await expect(client.getCurrentMatches()).rejects.toThrow(CricketDataRequestError);
  });

  it("wraps a network-level failure as CricketDataRequestError", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("DNS lookup failed"))) as unknown as typeof fetch;
    const client = new CricketDataFetchClient({ apiKey: "test-key", fetchImpl });
    await expect(client.getCurrentMatches()).rejects.toThrow(CricketDataRequestError);
  });

  it("times out and throws CricketDataRequestError rather than hanging forever", async () => {
    const fetchImpl = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    ) as unknown as typeof fetch;
    const client = new CricketDataFetchClient({ apiKey: "test-key", timeoutMs: 5, fetchImpl });
    await expect(client.getCurrentMatches()).rejects.toThrow(/timed out/);
  });
});
