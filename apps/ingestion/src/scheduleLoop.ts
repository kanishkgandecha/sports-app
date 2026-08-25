export interface ScheduledLoop {
  stop(): Promise<void>;
}

/**
 * Runs at most one tick at a time and schedules the next delay only after
 * the current tick settles. `setInterval(async ...)` silently overlaps slow
 * provider calls and makes shutdown race with in-flight database writes.
 */
export function scheduleLoop(tick: () => Promise<void>, intervalMs: number): ScheduledLoop {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;

  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = tick().finally(schedule);
    }, intervalMs);
  };
  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  };
}
