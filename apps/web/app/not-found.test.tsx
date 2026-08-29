import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "./not-found";

/**
 * Phase 5 regression coverage — an unmatched URL previously fell through to
 * Next's own built-in default 404 boilerplate, whose styled-jsx has no way
 * to carry this app's per-request CSP nonce and was blocked outright by the
 * strict style-src (no unsafe-inline). This page replaces that fallback
 * with a real, on-brand route that renders through the app's own dynamic
 * root layout instead.
 */
describe("root not-found page", () => {
  it("renders an on-brand message and a way back, with no inline style", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toHaveAttribute("href", "/");
    expect(container.querySelector("[style]")).toBeNull();
  });
});
