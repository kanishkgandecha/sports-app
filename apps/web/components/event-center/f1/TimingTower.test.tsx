import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimingTower } from "./TimingTower";
import styles from "./f1EventCenter.module.css";
import type { F1TimingRow } from "../../../lib/f1Api";

// TeamColorDot (see its doc comment) appends into this shared,
// already-approved stylesheet rather than an inline style attribute; tests
// provide it the way the real root layout does.
let sheetEl: HTMLStyleElement;
beforeEach(() => {
  sheetEl = document.createElement("style");
  sheetEl.id = "dynamic-team-colors";
  document.head.appendChild(sheetEl);
});
afterEach(() => sheetEl.remove());

function row(overrides: Partial<F1TimingRow>): F1TimingRow {
  return {
    position: 1,
    driver: {
      id: "d1",
      name: "Test Driver",
      shortName: "TST",
      avatarUrl: null,
      team: { id: "t1", name: "Test Team", colorHex: "#ff0000" },
    },
    gapToLeader: null,
    intervalToAhead: null,
    lastLapTime: null,
    bestLapTime: null,
    sector1: null,
    sector2: null,
    sector3: null,
    tyreCompound: null,
    state: "running",
    ...overrides,
  };
}

describe("TimingTower", () => {
  it("shows a loading state instead of an empty table while loading", () => {
    render(<TimingTower rows={[]} loading error={false} />);
    expect(screen.getByText(/Loading timing/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows an error state, not a misleading empty table, when timing failed to load", () => {
    render(<TimingTower rows={[]} loading={false} error />);
    expect(screen.getByRole("alert")).toHaveTextContent(/isn't available/i);
  });

  it("shows an honest empty state when there is genuinely no timing data yet", () => {
    render(<TimingTower rows={[]} loading={false} error={false} />);
    expect(screen.getByText(/No timing data yet/i)).toBeInTheDocument();
  });

  it("renders real driver/team/tyre data in position order, using tabular formatting", () => {
    const rows = [
      row({
        position: 1,
        driver: {
          id: "d1",
          name: "Leader",
          shortName: "LDR",
          avatarUrl: null,
          team: { id: "t1", name: "Team One", colorHex: "#ff0000" },
        },
        lastLapTime: 88.123,
        tyreCompound: "SOFT",
      }),
      row({
        position: 2,
        driver: {
          id: "d2",
          name: "Second",
          shortName: "SEC",
          avatarUrl: null,
          team: { id: "t2", name: "Team Two", colorHex: "#00ff00" },
        },
        gapToLeader: "+2.500",
      }),
    ];
    render(<TimingTower rows={rows} loading={false} error={false} />);

    const table = screen.getByRole("table");
    const rowsInTable = table.querySelectorAll("tbody tr");
    expect(rowsInTable).toHaveLength(2);
    expect(screen.getByText("LDR")).toBeInTheDocument();
    expect(screen.getByText("SEC")).toBeInTheDocument();
    expect(screen.getByText("+2.500")).toBeInTheDocument();
    expect(screen.getByText("1:28.123")).toBeInTheDocument(); // formatted lap time
  });

  it("never fabricates a value for a missing field — shows an em dash, not 0 or blank", () => {
    render(<TimingTower rows={[row({ gapToLeader: null, lastLapTime: null })]} loading={false} error={false} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("gives every column header a scope so screen readers announce it per cell", () => {
    render(<TimingTower rows={[row({})]} loading={false} error={false} />);
    for (const header of screen.getAllByRole("columnheader")) {
      expect(header).toHaveAttribute("scope", "col");
    }
  });

  it("exposes the horizontally scrollable timing table as a keyboard-focusable named region", () => {
    render(<TimingTower rows={[row({})]} loading={false} error={false} />);

    const region = screen.getByRole("region", { name: "Session timing table" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByText(/Driver positions, gaps, lap times/i)).toBeInTheDocument();
  });

  it("Phase 5 regression: never renders an inline style for the team-color swatch, using the shared stylesheet instead", () => {
    const { container } = render(
      <TimingTower
        rows={[
          row({
            driver: {
              id: "d1",
              name: "Leader",
              shortName: "LDR",
              avatarUrl: null,
              team: { id: "t1", name: "Team One", colorHex: "#ff0000" },
            },
          }),
        ]}
        loading={false}
        error={false}
      />,
    );
    expect(container.querySelector("[style]")).toBeNull();
    const rules = Array.from(sheetEl.sheet!.cssRules as unknown as CSSStyleRule[]);
    expect(rules.some((rule) => rule.style.background === "rgb(255, 0, 0)")).toBe(true);
  });

  it("flashes a row via the shared LiveValue mechanism (components/LiveValue.tsx) when its position changes", () => {
    const d1 = { id: "d1", name: "Leader", shortName: "LDR", avatarUrl: null, team: null };
    const { rerender } = render(
      <TimingTower rows={[row({ position: 1, driver: d1 })]} loading={false} error={false} />,
    );
    const tr = screen.getByText("LDR").closest("tr")!;
    expect(tr.className).not.toContain(styles.valueChanged);

    rerender(<TimingTower rows={[row({ position: 2, driver: d1 })]} loading={false} error={false} />);
    expect(tr.className).toContain(styles.valueChanged);
  });
});
