import { notFound } from "next/navigation";
import { getF1Fixture } from "../../../lib/f1Api";
import { getCricketFixture } from "../../../lib/cricketApi";
import { ApiError } from "../../../lib/api";
import { F1EventCenter } from "../../../components/event-center/f1/F1EventCenter";
import { CricketEventCenter } from "../../../components/event-center/cricket/CricketEventCenter";

/**
 * `/events/[id]` — the Event Center route (Checkpoint 5, docs/CONTEXT.md
 * §10). `[id]` is a real `Fixture.id`, never a hard-coded event — try any
 * id from `GET /api/f1/fixtures` or `GET /api/cricket/fixtures`.
 *
 * Cricket Checkpoint 2 — the sport dispatch this file's own doc comment
 * anticipated ahead of time ("once a second sport's fixtures exist to
 * dispatch to"). Dispatches on the id's own prefix (`f1-meeting-...` /
 * `cricket-match-...` — see each provider's `buildFixtureId`) rather than
 * adding a lookup endpoint just to answer "which sport is this": every
 * current and future provider for a given sport builds fixture ids under
 * that sport's own prefix, so this is a sport-level convention, not a
 * provider-specific one — no new infrastructure for what the id already
 * encodes. A prefix that matches neither is a genuine 404, same as an
 * unknown id within a single sport.
 *
 * A genuine 404 (no such fixture) renders `not-found.tsx`; any other
 * failure (API unreachable, 500, ...) is left to throw and is caught by
 * `error.tsx` — these are different situations and shouldn't look the same
 * to the user (§16's loading/empty/error requirement, applied at the route
 * level too).
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id.startsWith("cricket-")) {
    let data: Awaited<ReturnType<typeof getCricketFixture>>;
    try {
      data = await getCricketFixture(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error; // caught by error.tsx
    }
    return <CricketEventCenter fixture={data.fixture} sessions={data.sessions} detail={data.detail} />;
  }

  if (id.startsWith("f1-")) {
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

  notFound();
}
