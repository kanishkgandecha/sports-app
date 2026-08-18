import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BattingCard } from "./BattingCard";
import type { CricketBattingRow } from "../../../lib/cricketApi";

function row(overrides: Partial<CricketBattingRow>): CricketBattingRow {
  return {
    player: { id: "p1", name: "Janet Mbabazi", shortName: "J Mbabazi", avatarUrl: null },
    runs: 45,
    balls: 30,
    fours: 5,
    sixes: 1,
    strikeRate: 150,
    dismissalText: "not out",
    ...overrides,
  };
}

describe("BattingCard", () => {
  it("shows loading/empty/error states appropriately", () => {
    const { rerender } = render(<BattingCard rows={[]} loading error={false} />);
    expect(screen.getByText(/Loading batting card/i)).toBeInTheDocument();

    rerender(<BattingCard rows={[]} loading={false} error />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<BattingCard rows={[]} loading={false} error={false} />);
    expect(screen.getByText(/No batting card captured/i)).toBeInTheDocument();
  });

  it("renders real figures for every column", () => {
    render(<BattingCard rows={[row({})]} loading={false} error={false} />);
    expect(screen.getByText(/J Mbabazi/)).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("150.00")).toBeInTheDocument();
  });

  it("marks a not-out batter with an asterisk, not the real dismissal text", () => {
    render(<BattingCard rows={[row({ dismissalText: "not out" })]} loading={false} error={false} />);
    expect(screen.getByText(/J Mbabazi\*/)).toBeInTheDocument();
    expect(screen.queryByText("not out")).not.toBeInTheDocument();
  });

  it("shows the real dismissal text verbatim for a dismissed batter", () => {
    render(<BattingCard rows={[row({ dismissalText: "run out (Neema Pius)" })]} loading={false} error={false} />);
    expect(screen.getByText("run out (Neema Pius)")).toBeInTheDocument();
  });
});
