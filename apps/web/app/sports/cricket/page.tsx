import type { Metadata } from "next";
import { ComingSoon } from "../../../components/ComingSoon";

export const metadata: Metadata = { title: "Cricket — Sports Platform" };

/**
 * Cricket is next in the fixed build order (ARCHITECTURE.md, F1 → Cricket
 * → Football → Esports) — Checkpoint 7 did provider research and a domain
 * proposal (docs/CONTEXT.md, Checkpoint 7 §6-§10), not implementation.
 * This page reflects that real status, not a finished product.
 */
export default function CricketComingSoonPage() {
  return (
    <ComingSoon
      sport="Cricket"
      status="Coming next"
      progress={[
        "Provider research complete — Sportmonks Cricket recommended for production, a free tier for early adapter development",
        "Domain model proposed (Match, Innings, Over, Ball, current batsmen/bowler)",
        "Provider adapter and live Event Center not yet built",
      ]}
    />
  );
}
