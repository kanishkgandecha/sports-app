import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSelector } from "./SessionSelector";
import type { F1Session } from "../../../lib/f1Api";

function session(overrides: Partial<F1Session>): F1Session {
  return {
    id: "s1",
    type: "RACE",
    status: "scheduled",
    lifecycle: "upcoming",
    startTime: "2026-01-01T00:00:00Z",
    endTime: null,
    detailAvailable: true,
    ...overrides,
  };
}

describe("SessionSelector", () => {
  it("only renders tabs for sessions that actually exist for this fixture", () => {
    const sessions = [session({ id: "fp1", type: "FP1" }), session({ id: "race", type: "RACE" })];
    render(<SessionSelector sessions={sessions} activeSessionId="fp1" onSelect={vi.fn()} />);
    expect(screen.getByText("FP1")).toBeInTheDocument();
    expect(screen.getByText("Race")).toBeInTheDocument();
    expect(screen.queryByText("Sprint")).not.toBeInTheDocument();
  });

  it("marks the current session as visually and semantically active", () => {
    const sessions = [session({ id: "fp1", type: "FP1" }), session({ id: "race", type: "RACE" })];
    render(<SessionSelector sessions={sessions} activeSessionId="race" onSelect={vi.fn()} />);
    expect(screen.getByText("Race")).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("FP1")).not.toHaveAttribute("aria-current");
  });

  it("calls onSelect with the clicked session's id", async () => {
    const onSelect = vi.fn();
    const sessions = [session({ id: "fp1", type: "FP1" }), session({ id: "race", type: "RACE" })];
    render(<SessionSelector sessions={sessions} activeSessionId="fp1" onSelect={onSelect} />);

    await userEvent.click(screen.getByText("Race"));
    expect(onSelect).toHaveBeenCalledWith("race");
  });

  it("marks a live session distinctly", () => {
    const sessions = [session({ id: "race", type: "RACE", lifecycle: "live" })];
    render(<SessionSelector sessions={sessions} activeSessionId="race" onSelect={vi.fn()} />);
    expect(screen.getByText("Race ·")).toBeInTheDocument();
  });
});
