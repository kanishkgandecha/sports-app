import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LearnGrid } from "./LearnGrid";

const concepts = [
  {
    slug: "what-is-f1",
    title: "What is Formula 1?",
    difficulty: "beginner",
    shortExplanation: "Start with the championship basics.",
  },
  {
    slug: "safety-car",
    title: "Safety Car",
    difficulty: "intermediate",
    shortExplanation: "Why the field slows and bunches together.",
  },
  {
    slug: "red-flag",
    title: "Red Flag",
    difficulty: "intermediate",
    shortExplanation: "When a session must be stopped.",
  },
];

describe("LearnGrid", () => {
  it("renders the complete concept library with an accessible result count", () => {
    render(<LearnGrid concepts={concepts} />);

    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3 topics");
    expect(screen.getByRole("button", { name: /What is Formula 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Safety Car/ })).toBeInTheDocument();
  });

  it("filters concepts as the user types without requiring submission", async () => {
    render(<LearnGrid concepts={concepts} />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search topics" }), "safety");

    expect(screen.getByRole("button", { name: /Safety Car/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Red Flag/ })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 3 topics");
  });

  it("filters by difficulty and exposes the selected state", async () => {
    render(<LearnGrid concepts={concepts} />);

    const intermediate = screen.getByRole("button", { name: "intermediate" });
    await userEvent.click(intermediate);

    expect(intermediate).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /What is Formula 1/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Safety Car/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Red Flag/ })).toBeInTheDocument();
  });

  it("offers a recovery action when filters produce no matches", async () => {
    render(<LearnGrid concepts={concepts} />);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search topics" }), "pit lane speed limit");
    expect(screen.getByRole("heading", { name: "No explainers match" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3 topics");
    expect(screen.getByRole("button", { name: /What is Formula 1/ })).toBeInTheDocument();
  });
});
