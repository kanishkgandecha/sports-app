import { describe, expect, it, vi } from "vitest";
import { BaseProviderAdapter } from "./baseAdapter";

class F1TestAdapter extends BaseProviderAdapter {
  readonly id = "f1-test";
  readonly sportId = "f1";

  request<T>(fn: () => Promise<T>) {
    return this.timed("test", fn);
  }
}

describe("BaseProviderAdapter", () => {
  it("reports successful F1 provider requests", async () => {
    const logger = vi.fn();
    const adapter = new F1TestAdapter(logger);
    await expect(adapter.request(async () => "ok")).resolves.toBe("ok");
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ providerId: "f1-test", method: "test", ok: true }));
  });

  it("reports and rethrows F1 provider failures", async () => {
    const logger = vi.fn();
    const adapter = new F1TestAdapter(logger);
    await expect(
      adapter.request(async () => {
        throw new Error("upstream unavailable");
      }),
    ).rejects.toThrow("upstream unavailable");
    expect(logger).toHaveBeenCalledWith(expect.objectContaining({ ok: false, error: "upstream unavailable" }));
  });
});
