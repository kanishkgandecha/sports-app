import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandingsPanel } from "./StandingsPanel";

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

const driverStandingsBody = {
  season: { year: "2026", id: "f1-season-2026" },
  standings: [
    {
      position: 1,
      points: 219,
      wins: 6,
      driver: { id: "f1-driver-12", name: "Andrea Kimi Antonelli", shortName: "ANT", avatarUrl: null },
      team: { id: "f1-team-mercedes", name: "Mercedes", colorHex: "#27F4D2" },
    },
    {
      position: 2,
      points: 169,
      wins: 1,
      driver: { id: "f1-driver-44", name: "Lewis Hamilton", shortName: "HAM", avatarUrl: null },
      team: { id: "f1-team-ferrari", name: "Ferrari", colorHex: "#E8002D" },
    },
  ],
};

const constructorStandingsBody = {
  season: { year: "2026", id: "f1-season-2026" },
  standings: [
    { position: 1, points: 379, wins: 8, team: { id: "f1-team-mercedes", name: "Mercedes", colorHex: "#27F4D2" } },
    { position: 2, points: 307, wins: 2, team: { id: "f1-team-ferrari", name: "Ferrari", colorHex: "#E8002D" } },
  ],
};

function mockFetchOk() {
  return vi.fn(async (url: string | URL) => {
    const path = String(url);
    const body = path.includes("/standings/drivers") ? driverStandingsBody : constructorStandingsBody;
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("StandingsPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches both driver and constructor standings for the given year, and shows drivers by default", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());
    expect(screen.getByText("ANT")).toBeInTheDocument();
    expect(screen.getByText("Mercedes")).toBeInTheDocument();
    expect(screen.queryByText("379")).not.toBeInTheDocument(); // constructor points not shown while "Drivers" tab is active
  });

  it("switches to constructor standings on tab click, without a second network round-trip", async () => {
    const fetchImpl = mockFetchOk();
    vi.stubGlobal("fetch", fetchImpl);
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());

    const callsBeforeSwitch = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length;
    await userEvent.click(screen.getByRole("tab", { name: "Constructors" }));

    expect(screen.getByText("379")).toBeInTheDocument();
    expect(screen.queryByText("219")).not.toBeInTheDocument();
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBeforeSwitch); // both were already fetched up front
  });

  it("connects the active tab to its panel and supports arrow, Home, and End keyboard navigation", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());

    const drivers = screen.getByRole("tab", { name: "Drivers" });
    const constructors = screen.getByRole("tab", { name: "Constructors" });
    const panel = screen.getByRole("tabpanel");
    expect(drivers).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", drivers.id);
    expect(drivers).toHaveAttribute("tabindex", "0");
    expect(constructors).toHaveAttribute("tabindex", "-1");

    drivers.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(constructors).toHaveFocus();
    expect(constructors).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveAttribute("aria-labelledby", constructors.id);
    expect(screen.getByText("379")).toBeInTheDocument();

    await userEvent.keyboard("{Home}");
    expect(drivers).toHaveFocus();
    await userEvent.keyboard("{End}");
    expect(constructors).toHaveFocus();
  });

  it("labels each horizontally scrollable standings table as a keyboard-focusable region", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());

    const region = screen.getByRole("region", { name: "Driver championship standings" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("Driver championship positions, points, and wins")).toBeInTheDocument();
  });

  it("never renders a movement/position-change column — nothing here is truthfully calculable from a single snapshot", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());
    expect(screen.queryByText(/▲|▼|movement/i)).not.toBeInTheDocument();
  });

  it("shows an error state when the standings request fails, not an empty table", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })) as unknown as typeof fetch);
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByRole("alert").length).toBeGreaterThan(0));
  });

  it("opens the championship-points concept via the education trigger", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    const onExplain = vi.fn();
    render(<StandingsPanel year={2026} onExplain={onExplain} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());

    await userEvent.click(screen.getByText(/how are these determined/i));
    expect(onExplain).toHaveBeenCalledWith("championship-points");
  });

  it("Phase 5 regression: never renders an inline style for the team-color swatch, in either tab, using the shared stylesheet instead", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    const { container } = render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());
    expect(container.querySelector("[style]")).toBeNull();
    await waitFor(() => {
      const rules = Array.from(sheetEl.sheet!.cssRules as unknown as CSSStyleRule[]);
      expect(rules.some((rule) => rule.style.background === "rgb(39, 244, 210)")).toBe(true);
    });

    await userEvent.click(screen.getByRole("tab", { name: "Constructors" }));
    expect(container.querySelector("[style]")).toBeNull();
  });

  it("re-fetches when the year prop changes", async () => {
    const fetchImpl = mockFetchOk();
    vi.stubGlobal("fetch", fetchImpl);
    const { rerender } = render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());

    const callsBefore = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length;
    rerender(<StandingsPanel year={2025} onExplain={vi.fn()} />);
    await waitFor(() => expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
