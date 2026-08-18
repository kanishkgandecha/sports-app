import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BowlingCard } from "./BowlingCard";
import type { CricketBowlingRow } from "../../../lib/cricketApi";

function row(overrides: Partial<CricketBowlingRow>): CricketBowlingRow {
  return {
    player: { id: "p3", name: "Agnes Qwele", shortName: "A Qwele", avatarUrl: null },
    overs: 3.2,
    maidens: 0,
    runsConceded: 22,
    wickets: 1,
    economy: 6.6,
    ...overrides,
  };
}

describe("BowlingCard", () => {
  it("shows loading/empty/error states appropriately", () => {
    const { rerender } = render(<BowlingCard rows={[]} loading error={false} />);
    expect(screen.getByText(/Loading bowling figures/i)).toBeInTheDocument();

    rerender(<BowlingCard rows={[]} loading={false} error />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<BowlingCard rows={[]} loading={false} error={false} />);
    expect(screen.getByText(/No bowling figures captured/i)).toBeInTheDocument();
  });

  it("renders real figures for every column", () => {
    render(<BowlingCard rows={[row({})]} loading={false} error={false} />);
    expect(screen.getByText("A Qwele")).toBeInTheDocument();
    expect(screen.getByText("3.2")).toBeInTheDocument();
    expect(screen.getByText("22")).toBeInTheDocument();
    expect(screen.getByText("6.60")).toBeInTheDocument();
  });
});
