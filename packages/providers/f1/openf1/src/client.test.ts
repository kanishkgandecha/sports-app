import { describe, expect, it, vi } from "vitest";
import { OpenF1FetchClient, OpenF1RequestError } from "./client";

function fakeFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (url: string | URL) => impl(String(url))) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenF1FetchClient", () => {
  it("returns parsed JSON array on success", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse([{ a: 1 }]));
    const client = new OpenF1FetchClient({ fetchImpl });
    const result = await client.get("/meetings");
    expect(result).toEqual([{ a: 1 }]);
  });

  it("treats OpenF1's 404 'No results found' as an empty array, not an error", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ detail: "No results found." }, 404));
    const client = new OpenF1FetchClient({ fetchImpl });
    const result = await client.get("/drivers_championship");
    expect(result).toEqual([]);
  });

  it("throws OpenF1RequestError on a 500", async () => {
    const fetchImpl = fakeFetch(() => new Response("Internal Server Error", { status: 500 }));
    const client = new OpenF1FetchClient({ fetchImpl });
    await expect(client.get("/meetings")).rejects.toThrow(OpenF1RequestError);
  });

  it("throws OpenF1RequestError with status on a 429 that persists through every retry", async () => {
    const fetchImpl = fakeFetch(() => new Response("", { status: 429 }));
    const client = new OpenF1FetchClient({ fetchImpl, maxRetries: 1, retryDelayMs: 0 });
    await expect(client.get("/meetings")).rejects.toMatchObject({ status: 429 });
  });

  it("retries a 429 and succeeds once the rate limit clears — the exact scenario a live smoke test hit at Checkpoint 4", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls += 1;
      return calls === 1 ? new Response("", { status: 429 }) : jsonResponse([{ ok: true }]);
    });
    const client = new OpenF1FetchClient({ fetchImpl, maxRetries: 2, retryDelayMs: 0 });
    const result = await client.get("/meetings");
    expect(result).toEqual([{ ok: true }]);
    expect(calls).toBe(2);
  });

  it("does not retry a non-429 error at all", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls += 1;
      return new Response("Internal Server Error", { status: 500 });
    });
    const client = new OpenF1FetchClient({ fetchImpl, maxRetries: 2, retryDelayMs: 0 });
    await expect(client.get("/meetings")).rejects.toThrow(OpenF1RequestError);
    expect(calls).toBe(1);
  });

  it("throws OpenF1RequestError on malformed JSON rather than crashing the process", async () => {
    const fetchImpl = fakeFetch(() => new Response("not json{{{", { status: 200 }));
    const client = new OpenF1FetchClient({ fetchImpl });
    await expect(client.get("/meetings")).rejects.toThrow(OpenF1RequestError);
  });

  it("throws OpenF1RequestError when the response is valid JSON but not an array", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ detail: "unexpected shape" }, 200));
    const client = new OpenF1FetchClient({ fetchImpl });
    await expect(client.get("/meetings")).rejects.toThrow(OpenF1RequestError);
  });

  it("wraps a network-level failure (fetch rejecting) as OpenF1RequestError", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("DNS lookup failed"))) as unknown as typeof fetch;
    const client = new OpenF1FetchClient({ fetchImpl });
    await expect(client.get("/meetings")).rejects.toThrow(OpenF1RequestError);
  });

  it("times out and throws OpenF1RequestError rather than hanging forever", async () => {
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
    const client = new OpenF1FetchClient({ fetchImpl, timeoutMs: 5 });
    await expect(client.get("/meetings")).rejects.toThrow(/timed out/);
  });

  it("builds query strings from params, including OpenF1's comparison-operator keys", async () => {
    let capturedUrl = "";
    const fetchImpl = fakeFetch((url) => {
      capturedUrl = url;
      return jsonResponse([]);
    });
    const client = new OpenF1FetchClient({ fetchImpl });
    await client.get("/laps", { session_key: 9574, "date_start>": "2024-07-28T13:00:00" });
    expect(capturedUrl).toContain("session_key=9574");
    expect(capturedUrl).toContain("date_start%3E=2024-07-28T13%3A00%3A00");
  });

  it("never sends an Authorization header for the free historical client (no credentials configured)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(jsonResponse([]));
    }) as unknown as typeof fetch;
    const client = new OpenF1FetchClient({ fetchImpl });
    await client.get("/meetings");
    expect(capturedInit && "headers" in capturedInit ? capturedInit.headers : undefined).toBeUndefined();
  });
});
