import { describe, expect, it } from "vitest";
import { mapWithRateLimit } from "./concurrency";

describe("mapWithRateLimit", () => {
  it("calls fn once per item, preserving order in the result", async () => {
    const results = await mapWithRateLimit([1, 2, 3], 1, async (n) => n * 10);
    expect(results).toEqual([10, 20, 30]);
  });

  it("runs items sequentially, not concurrently — the second item never starts before the first finishes", async () => {
    const timeline: string[] = [];
    await mapWithRateLimit([1, 2], 1, async (n) => {
      timeline.push(`start-${n}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      timeline.push(`end-${n}`);
    });
    expect(timeline).toEqual(["start-1", "end-1", "start-2", "end-2"]);
  });

  it("handles an empty list without throwing", async () => {
    expect(await mapWithRateLimit([], 1, async (n) => n)).toEqual([]);
  });

  it("propagates an error from fn rather than swallowing it", async () => {
    await expect(
      mapWithRateLimit([1, 2], 1, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
