import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ConceptChip } from "./ConceptChip";

/**
 * Phase 5 regression coverage — the outer wrapper span used an inline
 * `style` prop (static values, missed by the checkpoint-7 pass that moved
 * everything else in this component onto ConceptChip.module.css), which
 * the strict CSP style-src (no unsafe-inline) blocks at runtime.
 */
describe("ConceptChip", () => {
  it("never renders an inline style attribute", () => {
    const { container } = render(<ConceptChip slug="drs" label="DRS" />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});
