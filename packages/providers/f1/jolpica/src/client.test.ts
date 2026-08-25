import { describe, expect, it, vi } from "vitest";
import { JolpicaFetchClient, JolpicaRequestError } from "./client";
import driverStandingsFixture from "./fixtures/driverStandings.2026.json";
import emptyFixture from "./fixtures/driverStandings.empty2099.json";
import errorFixture from "./fixtures/error.malformedRequest.json";

function fakeFetch(impl: (url: string) => Promise<Response> | Response) {
  return vi.fn(async (url: string | URL) => impl(String(url))) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("JolpicaFetchClient", () => {
  it("unwraps the real MRData envelope for driver standings", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(driverStandingsFixture));
    const client = new JolpicaFetchClient({ fetchImpl });
    const result = await client.getDriverStandings(2026);
    expect(result.length).toBe(22);
    expect(result[0].Driver.driverId).toBe("antonelli");
  });

  it("treats Jolpica's real 200 + empty StandingsLists as an empty array, not an error (opposite of OpenF1's 404-for-empty convention)", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(emptyFixture));
    const client = new JolpicaFetchClient({ fetchImpl });
    const result = await client.getDriverStandings(2099);
    expect(result).toEqual([]);
  });

  it("throws JolpicaRequestError with the real detail message on a 400", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(errorFixture, 400));
    const client = new JolpicaFetchClient({ fetchImpl });
    await expect(client.getDriverStandings(2026)).rejects.toThrow(/Missing one of the required parameters/);
  });

  it("throws JolpicaRequestError with status on a 429 that persists through every retry", async () => {
    const fetchImpl = fakeFetch(() => new Response("", { status: 429 }));
    const client = new JolpicaFetchClient({ fetchImpl, maxRetries: 1, retryDelayMs: 0 });
    await expect(client.getDriverStandings(2026)).rejects.toMatchObject({ status: 429 });
  });

  it("retries a 429 and succeeds once the rate limit clears", async () => {
    let calls = 0;
    const fetchImpl = fakeFetch(() => {
      calls += 1;
      return calls === 1 ? new Response("", { status: 429 }) : jsonResponse(driverStandingsFixture);
    });
    const client = new JolpicaFetchClient({ fetchImpl, maxRetries: 2, retryDelayMs: 0 });
    const result = await client.getDriverStandings(2026);
    expect(result.length).toBe(22);
    expect(calls).toBe(2);
  });

  it("throws JolpicaRequestError on malformed JSON rather than crashing the process", async () => {
    const fetchImpl = fakeFetch(() => new Response("not json{{{", { status: 200 }));
    const client = new JolpicaFetchClient({ fetchImpl });
    await expect(client.getDriverStandings(2026)).rejects.toThrow(JolpicaRequestError);
  });

  it("throws JolpicaRequestError when the response is valid JSON but has no MRData envelope", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ unexpected: "shape" }, 200));
    const client = new JolpicaFetchClient({ fetchImpl });
    await expect(client.getDriverStandings(2026)).rejects.toThrow(JolpicaRequestError);
  });

  it("wraps a network-level failure as JolpicaRequestError", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("DNS lookup failed"))) as unknown as typeof fetch;
    const client = new JolpicaFetchClient({ fetchImpl });
    await expect(client.getDriverStandings(2026)).rejects.toThrow(JolpicaRequestError);
  });

  it("times out and throws JolpicaRequestError rather than hanging forever", async () => {
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
    const client = new JolpicaFetchClient({ fetchImpl, timeoutMs: 5 });
    await expect(client.getDriverStandings(2026)).rejects.toThrow(/timed out/);
  });

  it("never sends an Authorization header (free, unauthenticated API)", async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn((_url: string | URL, init?: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(jsonResponse(driverStandingsFixture));
    }) as unknown as typeof fetch;
    const client = new JolpicaFetchClient({ fetchImpl });
    await client.getDriverStandings(2026);
    expect(capturedInit && "headers" in capturedInit ? capturedInit.headers : undefined).toBeUndefined();
  });
});
