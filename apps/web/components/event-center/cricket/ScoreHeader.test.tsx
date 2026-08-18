import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreHeader } from "./ScoreHeader";
import type { CricketInnings, CricketScorecard } from "../../../lib/cricketApi";

const TEAM_A = { id: "team-a", name: "Uganda", colorHex: "#0a5c36" };
const TEAM_B = { id: "team-b", name: "Rwanda", colorHex: "#1d6b3f" };
const BATSMAN_1 = { id: "p1", name: "Janet Mbabazi", shortName: "J Mbabazi", avatarUrl: null };
const BATSMAN_2 = { id: "p2", name: "Stephanie Nampiina", shortName: "S Nampiina", avatarUrl: null };
const BOWLER = { id: "p3", name: "Agnes Qwele", shortName: "A Qwele", avatarUrl: null };

function innings(overrides: Partial<CricketInnings>): CricketInnings {
  return {
    battingTeam: TEAM_A,
    bowlingTeam: TEAM_B,
    runs: 120,
    wickets: 3,
    overs: 18.4,
    notOutBatsmen: [],
    currentBowler: null,
    target: null,
    requiredRunRate: null,
    ...overrides,
  };
}

describe("ScoreHeader", () => {
  it("shows loading/empty/error states appropriately, never a misleading zero score", () => {
    const { rerender } = render(<ScoreHeader innings={null} scorecard={null} loading error={false} />);
    expect(screen.getByText(/Loading score/i)).toBeInTheDocument();

    rerender(<ScoreHeader innings={null} scorecard={null} loading={false} error />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<ScoreHeader innings={null} scorecard={null} loading={false} error={false} />);
    expect(screen.getByText(/No score captured/i)).toBeInTheDocument();
  });

  it("renders the real score, team names, and overs", () => {
    render(<ScoreHeader innings={innings({})} scorecard={null} loading={false} error={false} />);
    expect(screen.getByText("120/3")).toBeInTheDocument();
    expect(screen.getByText("Uganda")).toBeInTheDocument();
    expect(screen.getByText("vs Rwanda")).toBeInTheDocument();
    expect(screen.getByText("18.4 overs")).toBeInTheDocument();
  });

  it("shows target and required run rate only when the innings state has them (chasing)", () => {
    const { rerender } = render(<ScoreHeader innings={innings({})} scorecard={null} loading={false} error={false} />);
    expect(screen.queryByText(/Target/)).not.toBeInTheDocument();

    rerender(<ScoreHeader innings={innings({ target: 180, requiredRunRate: 7.5 })} scorecard={null} loading={false} error={false} />);
    expect(screen.getByText("Target 180")).toBeInTheDocument();
    expect(screen.getByText("Req. RR 7.50")).toBeInTheDocument();
  });

  it("shows not-out batsmen by name with an asterisk, with figures only when the scorecard has a matching row", () => {
    const scorecard: CricketScorecard = {
      batting: [{ player: BATSMAN_1, runs: 45, balls: 30, fours: 5, sixes: 1, strikeRate: 150, dismissalText: "not out" }],
      bowling: [],
    };
    render(
      <ScoreHeader
        innings={innings({ notOutBatsmen: [BATSMAN_1, BATSMAN_2] })}
        scorecard={scorecard}
        loading={false}
        error={false}
      />,
    );
    expect(screen.getByText("J Mbabazi*")).toBeInTheDocument();
    expect(screen.getByText("45 (30)")).toBeInTheDocument();
    // BATSMAN_2 has no matching scorecard row — name shown, no fabricated 0 (0) figures.
    expect(screen.getByText("S Nampiina*")).toBeInTheDocument();
    expect(screen.queryByText("0 (0)")).not.toBeInTheDocument();
  });

  it("shows the current bowler's figures only when the scorecard has a matching row", () => {
    render(<ScoreHeader innings={innings({ currentBowler: BOWLER })} scorecard={null} loading={false} error={false} />);
    expect(screen.getByText("A Qwele")).toBeInTheDocument();

    const scorecard: CricketScorecard = {
      batting: [],
      bowling: [{ player: BOWLER, overs: 3.2, maidens: 0, runsConceded: 22, wickets: 1, economy: 6.6 }],
    };
    render(<ScoreHeader innings={innings({ currentBowler: BOWLER })} scorecard={scorecard} loading={false} error={false} />);
    expect(screen.getByText("A Qwele — 3.2-0-22-1")).toBeInTheDocument();
  });
});
