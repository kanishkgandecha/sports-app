import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MatchEventFeed } from "./MatchEventFeed";
import type { CricketLiveEvent } from "../../../lib/cricketApi";

function event(overrides: Partial<CricketLiveEvent>): CricketLiveEvent {
  return { id: "e1", eventType: "SCORE_UPDATE", timestamp: "2026-01-01T12:00:00Z", payload: {}, ...overrides };
}

describe("MatchEventFeed", () => {
  it("shows loading/empty/error states appropriately, never a misleading empty list", () => {
    const { rerender } = render(<MatchEventFeed events={[]} loading error={false} onExplain={vi.fn()} />);
    expect(screen.getByText(/Loading match events/i)).toBeInTheDocument();

    rerender(<MatchEventFeed events={[]} loading={false} error onExplain={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    rerender(<MatchEventFeed events={[]} loading={false} error={false} onExplain={vi.fn()} />);
    expect(screen.getByText(/No match events yet/i)).toBeInTheDocument();
  });

  it("formats a SCORE_UPDATE from only the fields actually present in the payload", () => {
    render(
      <MatchEventFeed
        events={[event({ eventType: "SCORE_UPDATE", payload: { runs: 122, wickets: 3, overs: 18.4, deltaRuns: 4, deltaWickets: 0 } })]}
        loading={false}
        error={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText("+4 runs — 122/3 (18.4 overs)")).toBeInTheDocument();
  });

  it("formats a WICKET with the real dismissal text when present", () => {
    render(
      <MatchEventFeed
        events={[event({ eventType: "WICKET", payload: { wickets: 4, overs: 19.1, dismissalText: "run out (Neema Pius)" } })]}
        loading={false}
        error={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText("Wicket! run out (Neema Pius) — 4 down (19.1 overs)")).toBeInTheDocument();
  });

  it("formats a WICKET honestly with no dismissal text when the provider didn't supply one", () => {
    render(
      <MatchEventFeed
        events={[event({ eventType: "WICKET", payload: { wickets: 4, overs: 19.1, dismissalText: null } })]}
        loading={false}
        error={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText("Wicket! — 4 down (19.1 overs)")).toBeInTheDocument();
  });

  it("surfaces MATCH_STATUS verbatim", () => {
    render(
      <MatchEventFeed
        events={[event({ eventType: "MATCH_STATUS", payload: { status: "Innings Break" } })]}
        loading={false}
        error={false}
        onExplain={vi.fn()}
      />,
    );
    expect(screen.getByText("Innings Break")).toBeInTheDocument();
  });

  it("shows a 'what does this mean?' chip only for event types with a real mapped concept", async () => {
    const onExplain = vi.fn();
    render(
      <MatchEventFeed
        events={[
          event({ id: "e1", eventType: "WICKET", payload: { wickets: 1, overs: 4.2, dismissalText: null } }),
          event({ id: "e2", eventType: "MATCH_STATUS", payload: { status: "Rain delay" } }),
        ]}
        loading={false}
        error={false}
        onExplain={onExplain}
      />,
    );
    const chips = screen.getAllByText(/what does this mean/i);
    expect(chips).toHaveLength(1);
    await userEvent.click(chips[0]);
    expect(onExplain).toHaveBeenCalledWith("wicket");
  });

  it("carries the event type as a data attribute for the visual category color", () => {
    render(
      <MatchEventFeed
        events={[event({ eventType: "WICKET", payload: { wickets: 1, overs: 1, dismissalText: null } })]}
        loading={false}
        error={false}
        onExplain={vi.fn()}
      />,
    );
    const item = screen.getByText(/Wicket!/).closest("li");
    expect(item).toHaveAttribute("data-category", "WICKET");
  });
});
