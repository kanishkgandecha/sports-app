import Link from "next/link";
import { apiGet } from "../lib/api";
import type { F1Fixture } from "../lib/f1Api";
import { ConceptChip } from "../components/ConceptChip";
import { LiveTicker } from "../components/LiveTicker";

interface Sport {
  slug: string;
  name: string;
  status: string;
}

async function getSports(): Promise<Sport[]> {
  try {
    const { sports } = await apiGet<{ sports: Sport[] }>("/api/sports");
    return sports;
  } catch {
    // API not running yet — the shell still renders so design/education work
    // isn't blocked on the backend being up.
    return [];
  }
}

async function getF1Fixtures(): Promise<F1Fixture[]> {
  try {
    const { fixtures } = await apiGet<{ fixtures: F1Fixture[] }>("/api/f1/fixtures");
    return fixtures;
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const [sports, fixtures] = await Promise.all([getSports(), getF1Fixtures()]);

  return (
    <>
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <h1 style={{ fontSize: "var(--font-size-3xl)" }}>Live sports, explained as they happen.</h1>
        <p style={{ margin: 0, color: "var(--color-text-muted)", maxWidth: "60ch" }}>
          Follow Formula 1, cricket, football, and esports live — with a plain-language
          explanation one tap away whenever something you don&apos;t recognize happens.
        </p>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--font-size-lg)" }}>Sports</h2>
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
            gap: "var(--space-3)",
          }}
        >
          {sports.length === 0 && (
            <li style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>
              No sports loaded — start the API (see README) to populate this from the sport
              registry.
            </li>
          )}
          {sports.map((sport) => (
            <li
              key={sport.slug}
              style={{
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <strong>{sport.name}</strong>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-faint)" }}>
                {sport.status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
        <h2 style={{ fontSize: "var(--font-size-lg)" }}>Formula 1 — Event Center</h2>
        {fixtures.length === 0 ? (
          <p style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)", margin: 0 }}>
            No F1 fixtures bootstrapped yet — start the ingestion worker (see README) to
            populate this from the calendar.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {fixtures.map((fixture) => (
              <li key={fixture.id}>
                <Link
                  href={`/events/${fixture.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--space-3)",
                    padding: "var(--space-3) var(--space-4)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    color: "var(--color-text)",
                  }}
                >
                  <span>
                    <strong>{fixture.name}</strong>
                    {fixture.venue && (
                      <span style={{ color: "var(--color-text-faint)", fontSize: "var(--font-size-sm)" }}>
                        {" "}
                        — {fixture.venue.name}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-data)",
                      fontSize: "var(--font-size-xs)",
                      color: "var(--color-text-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    {fixture.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
        }}
      >
        <h2 style={{ fontSize: "var(--font-size-lg)" }}>New to Formula 1?</h2>
        <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "var(--font-size-sm)" }}>
          Education is optional and contextual — it never blocks the live experience
          (master brief §13). Try it:
        </p>
        <ConceptChip slug="safety-car" label="Safety Car" />
      </section>

      <LiveTicker />
    </>
  );
}
