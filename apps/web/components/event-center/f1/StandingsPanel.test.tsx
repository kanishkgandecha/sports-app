import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StandingsPanel } from "./StandingsPanel";

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

  it("never renders a movement/position-change column — nothing here is truthfully calculable from a single snapshot", async () => {
    vi.stubGlobal("fetch", mockFetchOk());
    render(<StandingsPanel year={2026} onExplain={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("219")).toBeInTheDocument());
    expect(screen.queryByText(/▲|▼|movement/i)).not.toBeInTheDocument();
  });

  it("shows an error state when the standings request fails, not an empty table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })) as unknown as typeof fetch,
    );
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
