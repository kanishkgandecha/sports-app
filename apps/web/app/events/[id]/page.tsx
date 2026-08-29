import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getF1Fixture, type F1Fixture } from "../../../lib/f1Api";
import { ApiError } from "../../../lib/api";
import { F1EventCenter } from "../../../components/event-center/f1/F1EventCenter";
import { SITE_URL } from "../../../lib/siteUrl";
import { venueLine } from "../../../lib/format";

/**
 * Phase 4 (event-page metadata) — noindex fallback shared by every path that
 * doesn't have a real fixture to describe: an id with an unknown prefix, a
 * genuinely missing fixture (404), and an unreachable API. All three mean
 * "no real event content exists here right now," so all three get the same
 * safe, generic, non-indexable metadata rather than guessing.
 */
const NOINDEX_METADATA: Metadata = { robots: { index: false, follow: false } };

/**
 * Reuses this route's own `getF1Fixture` — the exact data `EventPage` below
 * fetches to render the page — rather than a second, possibly-inconsistent
 * fetch. Errors are swallowed here (not rethrown) because generateMetadata
 * has no error.tsx-equivalent boundary of its own; a transient API failure
 * degrades to generic metadata instead of failing metadata generation for
 * the whole route.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!id.startsWith("f1-")) return NOINDEX_METADATA;

  let data: Awaited<ReturnType<typeof getF1Fixture>>;
  try {
    data = await getF1Fixture(id);
  } catch {
    return NOINDEX_METADATA;
  }

  const { fixture } = data;
  const title = fixture.name;
  const description = eventDescription(fixture);
  const url = `${SITE_URL}/events/${fixture.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", siteName: "F1 Race Center" },
    twitter: { card: "summary", title, description },
  };
}

function eventDescription(fixture: F1Fixture): string {
  const at = venueLine(fixture.venue);
  const location = at ? ` at ${at}` : "";
  switch (fixture.status) {
    case "completed":
      return `Results, timing, and race analysis for the ${fixture.name}${location}.`;
    case "live":
      return `Live timing and race control for the ${fixture.name}${location}.`;
    case "cancelled":
      return `The ${fixture.name}${location} was cancelled.`;
    case "postponed":
      return `The ${fixture.name}${location} has been postponed.`;
    default:
      return `Schedule and session times for the ${fixture.name}${location}.`;
  }
}

/** Renders a real F1 Fixture by id; unknown prefixes and missing fixtures are 404s. */
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);

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
    const requestedSession = scalar(query.session);
    return <F1EventCenter fixture={data.fixture} sessions={data.sessions} initialSessionId={requestedSession} />;
  }

  notFound();
}

function scalar(value: string | string[] | undefined) {
  return typeof value === "string" ? value : value?.[0];
}
