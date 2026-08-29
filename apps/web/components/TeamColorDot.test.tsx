import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TeamColorDot } from "./TeamColorDot";

/**
 * Phase 5 regression coverage — real-browser QA found that apps/web's
 * strict CSP (`style-src` with no `unsafe-inline`) blocks every
 * `style={{ background: colorHex }}` prop at runtime (see docs/CONTEXT.md's
 * Phase 5 checkpoint). A first fix (a per-instance nonce'd `<style>`) was
 * itself found broken by the same browser QA: it only works on a hard page
 * load, not on `next/link` client-side navigation, because the browser's
 * enforced CSP nonce is fixed to the original document response while a
 * fresh nonce is generated for every subsequent RSC fetch. The real fix
 * appends rules into ONE persistent, already-approved stylesheet (rendered
 * once in app/layout.tsx) via the CSSOM. These tests provide that sheet
 * the way the real layout does, and pin: no inline `style` attribute is
 * ever rendered, the rule lands in the shared sheet, and malformed
 * provider data can't be used to inject arbitrary CSS.
 */
describe("TeamColorDot", () => {
  let sheetEl: HTMLStyleElement;

  beforeEach(() => {
    sheetEl = document.createElement("style");
    sheetEl.id = "dynamic-team-colors";
    document.head.appendChild(sheetEl);
  });

  afterEach(() => {
    sheetEl.remove();
  });

  // Reads rules back as [selector, background] pairs rather than raw
  // cssText: browsers/jsdom re-serialize an inserted rule's color (e.g.
  // `#ff0000` becomes `rgb(255, 0, 0)`), so comparing against the literal
  // hex string this component constructs would be environment-fragile.
  function rules(): Array<[string, string]> {
    return Array.from(sheetEl.sheet!.cssRules as unknown as CSSStyleRule[]).map((rule) => [
      rule.selectorText,
      rule.style.background,
    ]);
  }

  it("never renders an inline style attribute, or a per-instance <style> element", () => {
    const { container } = render(<TeamColorDot id="d1" colorHex="#ff0000" className="swatch" />);
    const dot = container.querySelector("[data-team-dot]");
    expect(dot).not.toBeNull();
    expect(dot).not.toHaveAttribute("style");
    expect(dot).toHaveClass("swatch");
    expect(container.querySelector("style")).toBeNull();
  });

  it("appends the color as a rule in the shared, already-approved stylesheet", () => {
    render(<TeamColorDot id="d1" colorHex="#ff0000" />);
    const [[selector, background]] = rules();
    expect(selector).toBe('[data-team-dot="d1"]');
    expect(background).toBe("rgb(255, 0, 0)");
  });

  it("falls back to the default border token when colorHex is null", () => {
    render(<TeamColorDot id="d1" colorHex={null} />);
    expect(rules()[0][1]).toContain("var(--color-border)");
  });

  it("falls back to the default border token rather than trusting a malformed provider value", () => {
    render(<TeamColorDot id="d1" colorHex="red; } * { display: none" />);
    expect(rules()[0][1]).toContain("var(--color-border)");
    expect(sheetEl.sheet!.cssRules).toHaveLength(1); // the injection attempt didn't add a second rule
  });

  it("escapes a quote in the id so it can't break out of the attribute selector", () => {
    render(<TeamColorDot id={'d1"}*{color:red'} colorHex="#00ff00" />);
    expect(rules()[0][0]).toContain('d1\\"');
    expect(sheetEl.sheet!.cssRules).toHaveLength(1); // no extra rule was injected via the unescaped id
  });

  it("scopes independent instances to their own id so two dots don't collide", () => {
    render(
      <>
        <TeamColorDot id="d1" colorHex="#ff0000" />
        <TeamColorDot id="d2" colorHex="#00ff00" />
      </>,
    );
    expect(rules()).toEqual([
      ['[data-team-dot="d1"]', "rgb(255, 0, 0)"],
      ['[data-team-dot="d2"]', "rgb(0, 255, 0)"],
    ]);
  });

  it("does not insert a duplicate rule when the same id/color renders again (e.g. a second mounted instance)", () => {
    render(
      <>
        <TeamColorDot id="d1" colorHex="#ff0000" />
        <TeamColorDot id="d1" colorHex="#ff0000" />
      </>,
    );
    expect(rules()).toHaveLength(1);
  });

  it("degrades without throwing when the shared stylesheet isn't present yet", () => {
    sheetEl.remove();
    expect(() => render(<TeamColorDot id="d1" colorHex="#ff0000" />)).not.toThrow();
  });
});
