import { describe, expect, it } from "vitest";
import { parseCursor } from "./live";

describe("SSE resume cursor validation", () => {
  it("treats an absent cursor as a new subscription", () => {
    expect(parseCursor(undefined)).toBeNull();
    expect(parseCursor("")).toBeNull();
  });

  it("accepts zero and arbitrarily large integer cursors without number precision loss", () => {
    expect(parseCursor("0")).toBe(0n);
    expect(parseCursor("900719925474099312345")).toBe(900719925474099312345n);
  });

  it.each(["-1", "1.5", "01", "abc"])("rejects malformed cursor %s", (cursor) => {
    expect(parseCursor(cursor)).toBe("invalid");
  });

  it("rejects duplicate cursor headers", () => {
    expect(parseCursor(["1", "2"])).toBe("invalid");
  });
});
