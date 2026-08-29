import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildStaticSecurityHeaders } from "./securityHeaders";

describe("buildContentSecurityPolicy", () => {
  it("scopes every fetch directive to 'self' plus the given API origin", () => {
    const csp = buildContentSecurityPolicy({ nonce: "abc123", isDev: false, apiOrigin: "http://localhost:4000" });
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self' http://localhost:4000");
  });

  it("embeds the given nonce in both script-src and style-src", () => {
    const csp = buildContentSecurityPolicy({ nonce: "the-nonce", isDev: false, apiOrigin: "http://localhost:4000" });
    expect(csp).toContain("script-src 'self' 'nonce-the-nonce' 'strict-dynamic'");
    expect(csp).toContain("style-src 'self' 'nonce-the-nonce'");
  });

  it("never allows 'unsafe-inline' script execution", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false, apiOrigin: "http://localhost:4000" });
    expect(csp).not.toContain("unsafe-inline");
  });

  it("adds 'unsafe-eval' to script-src only in development", () => {
    const dev = buildContentSecurityPolicy({ nonce: "n", isDev: true, apiOrigin: "http://localhost:4000" });
    const prod = buildContentSecurityPolicy({ nonce: "n", isDev: false, apiOrigin: "http://localhost:4000" });
    expect(dev).toContain("'unsafe-eval'");
    expect(prod).not.toContain("'unsafe-eval'");
  });

  it("blocks framing, plugins, and non-self form submission", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false, apiOrigin: "http://localhost:4000" });
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("produces a syntactically valid, semicolon-delimited directive list with no empty directives", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false, apiOrigin: "http://localhost:4000" });
    const directives = csp.split("; ");
    expect(directives.length).toBeGreaterThan(5);
    for (const directive of directives) {
      expect(directive.trim()).not.toBe("");
      expect(directive).not.toMatch(/;\s*;/);
    }
  });

  it("reflects a different configured API origin verbatim", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: false, apiOrigin: "https://api.example.com" });
    expect(csp).toContain("connect-src 'self' https://api.example.com");
  });
});

describe("buildStaticSecurityHeaders", () => {
  const headers = new Map(buildStaticSecurityHeaders());

  it("prevents MIME sniffing", () => {
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("prevents framing by any origin", () => {
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("limits cross-origin referrer leakage without breaking same-origin referrers", () => {
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("denies unused browser capabilities", () => {
    const policy = headers.get("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
  });

  it("does not include the obsolete X-XSS-Protection header", () => {
    expect(headers.has("X-XSS-Protection")).toBe(false);
  });

  it("does not include Strict-Transport-Security (no TLS-termination story yet)", () => {
    expect(headers.has("Strict-Transport-Security")).toBe(false);
  });
});
