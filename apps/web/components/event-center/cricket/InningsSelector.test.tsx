import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InningsSelector } from "./InningsSelector";
import type { CricketSession } from "../../../lib/cricketApi";

function session(overrides: Partial<CricketSession>): CricketSession {
  return {
    id: "s1",
    type: "1ST_INNINGS",
    status: "scheduled",
    lifecycle: "upcoming",
    startTime: "2026-01-01T00:00:00Z",
    endTime: null,
    ...overrides,
  };
}

describe("InningsSelector", () => {
  it("only renders tabs for innings that actually exist for this fixture", () => {
    const sessions = [session({ id: "i1", type: "1ST_INNINGS" }), session({ id: "i2", type: "2ND_INNINGS" })];
    render(<InningsSelector sessions={sessions} activeSessionId="i1" onSelect={vi.fn()} />);
    expect(screen.getByText("1st Innings")).toBeInTheDocument();
    expect(screen.getByText("2nd Innings")).toBeInTheDocument();
    expect(screen.queryByText("3rd Innings")).not.toBeInTheDocument();
  });

  it("marks the current innings as visually and semantically active", () => {
    const sessions = [session({ id: "i1", type: "1ST_INNINGS" }), session({ id: "i2", type: "2ND_INNINGS" })];
    render(<InningsSelector sessions={sessions} activeSessionId="i2" onSelect={vi.fn()} />);
    expect(screen.getByText("2nd Innings")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("1st Innings")).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect with the clicked innings' session id", async () => {
    const onSelect = vi.fn();
    const sessions = [session({ id: "i1", type: "1ST_INNINGS" }), session({ id: "i2", type: "2ND_INNINGS" })];
    render(<InningsSelector sessions={sessions} activeSessionId="i1" onSelect={onSelect} />);

    await userEvent.click(screen.getByText("2nd Innings"));
    expect(onSelect).toHaveBeenCalledWith("i2");
  });

  it("marks a live innings distinctly", () => {
    const sessions = [session({ id: "i2", type: "2ND_INNINGS", lifecycle: "live" })];
    render(<InningsSelector sessions={sessions} activeSessionId="i2" onSelect={vi.fn()} />);
    expect(screen.getByText("2nd Innings ·")).toBeInTheDocument();
  });
});
