"use client";

/** Next.js route-segment error boundary — anything other than a genuine 404 (see page.tsx) lands here, not a browser alert. */
export default function EventError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <h1 style={{ fontSize: "var(--font-size-xl)" }}>Couldn&apos;t load this event</h1>
      <p style={{ color: "var(--color-text-muted)", margin: 0 }}>
        The backend might be temporarily unavailable. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          alignSelf: "flex-start",
          font: "inherit",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-accent)",
          background: "none",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-2) var(--space-4)",
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}
