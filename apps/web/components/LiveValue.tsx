"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Checkpoint 7 — extracted from `TimingTower`'s own ad hoc flash-tracking
 * (a local `Map`/`Set` re-implemented inline), which is exactly the
 * "live-data component" layer ARCHITECTURE.md §2 already named `LiveValue`
 * for but never actually built as its own thing. Any value that updates
 * live (a lap time, a position, a point total) can flash/settle the same
 * way without re-deriving this logic per component.
 *
 * Deliberately just a changed-flag hook, not a component that owns
 * rendering: `TimingTower` flashes a whole *row* when any of several
 * fields changes (position OR lastLapTime), which a single "wrap this one
 * value" component couldn't express — the hook composes; a component
 * wrapping one value is provided below for the simpler, common case.
 */
export function useLiveFlash(value: unknown, holdMs = 500): boolean {
  const previous = useRef(value);
  const [flashing, setFlashing] = useState(false);

  useEffect(() => {
    if (previous.current !== value) {
      previous.current = value;
      setFlashing(true);
      const timeout = setTimeout(() => setFlashing(false), holdMs);
      return () => clearTimeout(timeout);
    }
  }, [value, holdMs]);

  return flashing;
}

/**
 * The simple case: wrap one value, get a flash-on-change span. Respects
 * `prefers-reduced-motion` the same way every other animation in this app
 * does — via the token layer (`--duration-*` zero out), not a JS branch
 * here; `className` is applied unconditionally, the CSS neutralizes it.
 */
export function LiveValue({
  value,
  className,
  flashClassName,
  children,
}: {
  value: unknown;
  className?: string;
  flashClassName: string;
  children: React.ReactNode;
}) {
  const flashing = useLiveFlash(value);
  return <span className={[className, flashing ? flashClassName : ""].filter(Boolean).join(" ")}>{children}</span>;
}
