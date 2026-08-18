import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimingTower } from "./TimingTower";
import type { F1TimingRow } from "../../../lib/f1Api";

function row(overrides: Partial<F1TimingRow>): F1TimingRow {
  return {
    position: 1,
    driver: { id: "d1", name: "Test Driver", shortName: "TST", avatarUrl: null, team: { id: "t1", name: "Test Team", colorHex: "#ff0000" } },
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
      row({ position: 1, driver: { id: "d1", name: "Leader", shortName: "LDR", avatarUrl: null, team: { id: "t1", name: "Team One", colorHex: "#ff0000" } }, lastLapTime: 88.123, tyreCompound: "SOFT" }),
      row({ position: 2, driver: { id: "d2", name: "Second", shortName: "SEC", avatarUrl: null, team: { id: "t2", name: "Team Two", colorHex: "#00ff00" } }, gapToLeader: "+2.500" }),
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
});
