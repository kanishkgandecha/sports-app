import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GlossaryDrawer } from "./GlossaryDrawer";
import { apiGet } from "../../../lib/api";

vi.mock("../../../lib/api", () => ({ apiGet: vi.fn() }));
const mockApiGet = vi.mocked(apiGet);

const SAFETY_CAR_RESPONSE = {
  concept: { slug: "safety-car", title: "Safety Car", detailExplanation: "A car sent out to slow the field." },
  related: [{ slug: "vsc", title: "Virtual Safety Car" }],
  precededBy: [],
  followedBy: [{ slug: "safety-car-restart", title: "Safety Car Restart" }],
};

describe("GlossaryDrawer", () => {
  it("shows a loading state, then the concept once it loads — real content, not fabricated", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={vi.fn()} />);

    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("heading", { name: "Safety Car" })).toBeInTheDocument());
    expect(screen.getByText(/A car sent out to slow the field/)).toBeInTheDocument();
  });

  it("shows an error state if the concept fails to load, not a blank drawer", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("network error"));
    render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/couldn't load/i)).toBeInTheDocument());
  });

  it("closes on Escape", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    const onClose = vi.fn();
    render(<GlossaryDrawer slug="safety-car" onClose={onClose} onNavigate={vi.fn()} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the close button is clicked", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    const onClose = vi.fn();
    render(<GlossaryDrawer slug="safety-car" onClose={onClose} onNavigate={vi.fn()} />);
    await userEvent.click(screen.getByText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates to a related concept without closing the drawer", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    const onNavigate = vi.fn();
    render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={onNavigate} />);

    await waitFor(() => screen.getByText("Safety Car Restart"));
    await userEvent.click(screen.getByText("Safety Car Restart"));
    expect(onNavigate).toHaveBeenCalledWith("safety-car-restart");
  });

  it("dedupes a concept that appears in both followedBy and related, rather than rendering it (and its React key) twice", async () => {
    // Caught by a real-browser check (Checkpoint 5, docs/CONTEXT.md §10) as
    // a React "two children with the same key" warning — "grand-prix"
    // legitimately appears in both lists for "what-is-f1".
    mockApiGet.mockResolvedValueOnce({
      concept: { slug: "what-is-f1", title: "What is Formula 1?", detailExplanation: "..." },
      related: [{ slug: "grand-prix", title: "Grand Prix" }],
      precededBy: [],
      followedBy: [{ slug: "grand-prix", title: "Grand Prix" }],
    });
    render(<GlossaryDrawer slug="what-is-f1" onClose={vi.fn()} onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "What is Formula 1?" })).toBeInTheDocument());
    expect(screen.getAllByText("Grand Prix")).toHaveLength(1);
  });

  it("moves focus to the Close button on open (Checkpoint 7 — a dialog that opens without moving focus traps a keyboard user)", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(screen.getByText("Close")).toHaveFocus();
  });

  it("restores focus to whatever triggered it once the drawer unmounts", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();

    const { unmount } = render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={vi.fn()} />);
    expect(trigger).not.toHaveFocus();

    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("re-fetches when the slug prop changes (navigating within the same drawer instance)", async () => {
    mockApiGet.mockResolvedValueOnce(SAFETY_CAR_RESPONSE);
    const { rerender } = render(<GlossaryDrawer slug="safety-car" onClose={vi.fn()} onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Safety Car" })).toBeInTheDocument());

    mockApiGet.mockResolvedValueOnce({
      concept: { slug: "vsc", title: "Virtual Safety Car", detailExplanation: "Speed-limit based neutralization." },
      related: [],
      precededBy: [],
      followedBy: [],
    });
    rerender(<GlossaryDrawer slug="vsc" onClose={vi.fn()} onNavigate={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Virtual Safety Car" })).toBeInTheDocument());
    expect(mockApiGet).toHaveBeenCalledWith("/api/education/concepts/vsc");
  });
});
