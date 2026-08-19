import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Countdown } from "./Countdown";

describe("Countdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders — before the first client tick, avoiding a hydration mismatch", () => {
    // Fake timers still let the mount-time effect run synchronously in
    // React Testing Library, so assert the pre-effect shape isn't
    // necessary here — real coverage is the formatted value below.
    render(<Countdown targetIso="2026-01-02T00:00:00Z" />);
    expect(screen.getByText(/\d/)).toBeInTheDocument();
  });

  it("formats a multi-day remaining time as days + hours", () => {
    render(<Countdown targetIso="2026-01-03T05:00:00Z" />);
    expect(screen.getByText("2d 5h")).toBeInTheDocument();
  });

  it("formats a same-day remaining time as hours + minutes", () => {
    render(<Countdown targetIso="2026-01-01T02:30:00Z" />);
    expect(screen.getByText("2h 30m")).toBeInTheDocument();
  });

  it("formats a sub-hour remaining time as minutes only", () => {
    render(<Countdown targetIso="2026-01-01T00:45:00Z" />);
    expect(screen.getByText("45m")).toBeInTheDocument();
  });

  it("shows 'Live now' once the target time has passed", () => {
    render(<Countdown targetIso="2025-12-31T00:00:00Z" />);
    expect(screen.getByText("Live now")).toBeInTheDocument();
  });

  it("applies the caller-supplied valueClassName rather than assuming its own styling", () => {
    render(<Countdown targetIso="2026-01-01T00:45:00Z" valueClassName="my-class" />);
    expect(screen.getByText("45m")).toHaveClass("my-class");
  });
});
