import { describe, expect, it, vi } from "vitest";
import { scheduleLoop } from "./scheduleLoop";

describe("scheduleLoop", () => {
  it("never overlaps slow asynchronous ticks and stops cleanly", async () => {
    vi.useFakeTimers();
    let active = 0;
    let maxActive = 0;
    let release: (() => void) | undefined;
    const loop = scheduleLoop(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      active -= 1;
    }, 100);

    await vi.advanceTimersByTimeAsync(500);
    expect(maxActive).toBe(1);
    release?.();
    await vi.advanceTimersByTimeAsync(100);
    release?.();
    await loop.stop();
    expect(maxActive).toBe(1);
    vi.useRealTimers();
  });
});
