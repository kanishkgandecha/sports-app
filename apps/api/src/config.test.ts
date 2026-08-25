import { describe, expect, it } from "vitest";
import { readApiConfig } from "./config";

describe("readApiConfig", () => {
  it("uses safe local defaults", () => {
    expect(readApiConfig({})).toEqual({
      port: 4000,
      corsOrigins: ["http://localhost:3000"],
      rateLimitMax: 300,
      bodyLimitBytes: 1_048_576,
    });
  });

  it("accepts a comma-separated explicit allowlist", () => {
    expect(readApiConfig({ CORS_ORIGINS: "https://sports.example, http://localhost:3000" }).corsOrigins).toEqual([
      "https://sports.example",
      "http://localhost:3000",
    ]);
  });

  it("rejects wildcard CORS and unsafe numeric values", () => {
    expect(() => readApiConfig({ CORS_ORIGINS: "*" })).toThrow("wildcard is not allowed");
    expect(() => readApiConfig({ API_RATE_LIMIT_MAX: "0" })).toThrow("positive integer");
  });
});
