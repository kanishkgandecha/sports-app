import { afterEach, describe, expect, it } from "vitest";
import { readPositiveInteger } from "./config";

describe("readPositiveInteger", () => {
  afterEach(() => delete process.env.TEST_POSITIVE_INTEGER);

  it("uses the fallback only when the variable is absent", () => {
    expect(readPositiveInteger("TEST_POSITIVE_INTEGER", 10)).toBe(10);
  });

  it("accepts a positive integer", () => {
    process.env.TEST_POSITIVE_INTEGER = "25";
    expect(readPositiveInteger("TEST_POSITIVE_INTEGER", 10)).toBe(25);
  });

  it.each(["0", "-1", "1.5", "NaN"])("rejects invalid value %s", (value) => {
    process.env.TEST_POSITIVE_INTEGER = value;
    expect(() => readPositiveInteger("TEST_POSITIVE_INTEGER", 10)).toThrow("must be a positive integer");
  });
});
