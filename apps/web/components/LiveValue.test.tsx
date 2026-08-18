import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { LiveValue, useLiveFlash } from "./LiveValue";

describe("useLiveFlash", () => {
  it("does not flash on the initial render", () => {
    const { result } = renderHook(() => useLiveFlash(1));
    expect(result.current).toBe(false);
  });

  it("flashes true when the value changes, then settles back to false after holdMs", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value }) => useLiveFlash(value, 500), { initialProps: { value: 1 } });
    expect(result.current).toBe(false);

    rerender({ value: 2 });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
    vi.useRealTimers();
  });

  it("does not flash when re-rendered with the same value", () => {
    const { result, rerender } = renderHook(({ value }) => useLiveFlash(value), { initialProps: { value: "x" } });
    rerender({ value: "x" });
    expect(result.current).toBe(false);
  });
});

describe("LiveValue", () => {
  it("applies the flash class only immediately after the value changes", () => {
    const { rerender } = render(
      <LiveValue value={1} className="base" flashClassName="flash">
        1
      </LiveValue>,
    );
    expect(screen.getByText("1")).not.toHaveClass("flash");

    rerender(
      <LiveValue value={2} className="base" flashClassName="flash">
        2
      </LiveValue>,
    );
    expect(screen.getByText("2")).toHaveClass("flash");
    expect(screen.getByText("2")).toHaveClass("base");
  });
});
