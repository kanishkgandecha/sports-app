import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RaceControlFeed } from "./RaceControlFeed";
import type { F1RaceControlMessage } from "../../../lib/f1Api";

function msg(overrides: Partial<F1RaceControlMessage>): F1RaceControlMessage {
  return { id: "m1", timestamp: "2026-01-01T12:00:00Z", category: "message", message: "SESSION STARTED", ...overrides };
}

describe("RaceControlFeed", () => {
  it("shows loading/empty/error states appropriately, never a misleading empty list", () => {
    const { rerender } = render(<RaceControlFeed messages={[]} loading error={false} onExplain={vi.fn()} />);
    expect(screen.getByText(/Loading race control/i)).toBeInTheDocument();

    rerender(<RaceControlFeed messages={[]} loading={false} error onExplain={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<RaceControlFeed messages={[]} loading={false} error={false} onExplain={vi.fn()} />);
    expect(screen.getByText(/No race control messages/i)).toBeInTheDocument();
  });

  it("renders only real backend messages, verbatim", () => {
    render(
      <RaceControlFeed messages={[msg({ message: "RED FLAG" })]} loading={false} error={false} onExplain={vi.fn()} />,
    );
    expect(screen.getByText("RED FLAG")).toBeInTheDocument();
  });

  it("shows a 'what does this mean?' chip for a category with a real education concept", async () => {
    const onExplain = vi.fn();
    render(
      <RaceControlFeed
        messages={[msg({ category: "safety_car", message: "SAFETY CAR DEPLOYED" })]}
        loading={false}
        error={false}
        onExplain={onExplain}
      />,
    );
    const chip = screen.getByText(/what does this mean/i);
    await userEvent.click(chip);
    expect(onExplain).toHaveBeenCalledWith("safety-car");
  });

  it("does not show an education chip for a generic message with no mapped concept", () => {
    render(
      <RaceControlFeed messages={[msg({ category: "message" })]} loading={false} error={false} onExplain={vi.fn()} />,
    );
    expect(screen.queryByText(/what does this mean/i)).not.toBeInTheDocument();
  });

  it("carries the semantic category as a data attribute for the visual state (border color)", () => {
    render(
      <RaceControlFeed messages={[msg({ category: "red_flag" })]} loading={false} error={false} onExplain={vi.fn()} />,
    );
    const item = screen.getByText("SESSION STARTED").closest("li");
    expect(item).toHaveAttribute("data-category", "red_flag");
  });
});
