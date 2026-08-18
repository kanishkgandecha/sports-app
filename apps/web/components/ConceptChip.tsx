"use client";

import { useState } from "react";
import { apiGet } from "../lib/api";

interface ConceptResponse {
  concept: { title: string; shortExplanation: string; detailExplanation: string };
  followedBy: { slug: string; title: string }[];
}

/**
 * "What does this mean?" — the entry point required by master brief §1/§13.
 * Contextual, optional, and never blocking: it's a button next to whatever
 * live moment triggered it, not a modal the user has to dismiss.
 */
export function ConceptChip({ slug, label }: { slug: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ConceptResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setOpen((v) => !v);
    if (!data && !loading) {
      setLoading(true);
      try {
        setData(await apiGet<ConceptResponse>(`/api/education/concepts/${slug}`));
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          font: "inherit",
          fontSize: "var(--font-size-sm)",
          color: "var(--color-accent)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: "3px",
        }}
      >
        {label} — what does this mean?
      </button>

      {open && (
        <div
          style={{
            maxWidth: "42ch",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-sm)",
            fontSize: "var(--font-size-sm)",
            color: "var(--color-text-muted)",
          }}
        >
          {loading && "Loading…"}
          {data && (
            <>
              <strong style={{ color: "var(--color-text)", display: "block", marginBottom: "var(--space-1)" }}>
                {data.concept.title}
              </strong>
              {data.concept.shortExplanation}
              {data.followedBy.length > 0 && (
                <div style={{ marginTop: "var(--space-2)", color: "var(--color-text-faint)" }}>
                  What happens next: {data.followedBy.map((c) => c.title).join(", ")}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
