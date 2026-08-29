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
    detailStatus: "available",
    detailReason: null,
    nextRetryAt: null,
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
    expect(screen.getByRole("tab", { name: /Race/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Race/ })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: /FP1/ })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: /FP1/ })).toHaveAttribute("tabindex", "-1");
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
    expect(screen.getByText("Live now")).toBeInTheDocument();
  });

  it("labels a completed session whose provider has no historical detail", () => {
    const sessions = [
      session({
        id: "fp1",
        type: "FP1",
        status: "completed",
        lifecycle: "completed",
        detailAvailable: false,
        detailStatus: "upstream-unavailable",
      }),
    ];
    render(<SessionSelector sessions={sessions} activeSessionId="fp1" onSelect={vi.fn()} />);
    expect(screen.getByText("Unavailable")).toBeInTheDocument();
  });

  it("supports arrow-key tab navigation and moves focus with selection", async () => {
    const onSelect = vi.fn();
    const sessions = [session({ id: "fp1", type: "FP1" }), session({ id: "race", type: "RACE" })];
    render(<SessionSelector sessions={sessions} activeSessionId="fp1" onSelect={onSelect} />);

    const fp1 = screen.getByRole("tab", { name: /FP1/ });
    fp1.focus();
    await userEvent.keyboard("{ArrowRight}");

    expect(onSelect).toHaveBeenCalledWith("race");
    expect(screen.getByRole("tab", { name: /Race/ })).toHaveFocus();
  });

  it("announces whether completed session data is ready", () => {
    const sessions = [session({ id: "race", lifecycle: "completed", status: "completed" })];
    render(<SessionSelector sessions={sessions} activeSessionId="race" onSelect={vi.fn()} />);

    expect(screen.getByText("Data ready")).toBeInTheDocument();
  });
});
