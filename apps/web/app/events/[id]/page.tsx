import { notFound } from "next/navigation";
import { getF1Fixture } from "../../../lib/f1Api";
import { ApiError } from "../../../lib/api";
import { F1EventCenter } from "../../../components/event-center/f1/F1EventCenter";

/**
 * `/events/[id]` — the Event Center route (Checkpoint 5, docs/CONTEXT.md
 * §10). `[id]` is a real `Fixture.id`, never a hard-coded Grand Prix — try
 * any id from `GET /api/f1/fixtures`.
 *
 * F1-only for now, matching this checkpoint's exact scope (no other sport
 * is implemented yet) — the natural extension point for a future
 * `EventCenter` sport-dispatch wrapper (ARCHITECTURE.md §16) is here, once
 * a second sport's fixtures exist to dispatch to. Not built speculatively
 * ahead of that.
 *
 * A genuine 404 (no such fixture) renders `not-found.tsx`; any other
 * failure (API unreachable, 500, ...) is left to throw and is caught by
 * `error.tsx` — these are different situations and shouldn't look the same
 * to the user (§16's loading/empty/error requirement, applied at the route
 * level too).
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getF1Fixture>>;
  try {
    data = await getF1Fixture(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    throw error; // caught by error.tsx
  }

  return <F1EventCenter fixture={data.fixture} sessions={data.sessions} />;
}
