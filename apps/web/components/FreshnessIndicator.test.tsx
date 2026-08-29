import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreshnessIndicator } from "./FreshnessIndicator";

/**
 * Phase 5 regression coverage — was built from inline `style` props keyed
 * by freshness state, which the strict CSP style-src (no unsafe-inline)
 * blocks at runtime. Now driven entirely by a `data-state` attribute and a
 * static CSS module (FreshnessIndicator.module.css).
 */
describe("FreshnessIndicator", () => {
  it("never renders an inline style attribute", () => {
    const { container } = render(<FreshnessIndicator state="live" updatedAt={new Date().toISOString()} />);
    expect(container.querySelector("[style]")).toBeNull();
  });

  it.each(["live", "updated", "delayed", "offline"] as const)(
    "exposes the %s state via a data-state attribute the stylesheet keys off of",
    (state) => {
      render(<FreshnessIndicator state={state} updatedAt={new Date().toISOString()} />);
      expect(
        screen.getByText(new RegExp(state === "live" ? "LIVE" : state, "i")).closest("[data-state]"),
      ).toHaveAttribute("data-state", state);
    },
  );
});
