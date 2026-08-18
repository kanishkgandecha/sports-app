import type { Metadata } from "next";
import { ComingSoon } from "../../../components/ComingSoon";

export const metadata: Metadata = { title: "Esports — Sports Platform" };

export default function EsportsComingSoonPage() {
  return (
    <ComingSoon
      sport="Esports"
      status="Planned"
      progress={["Last in the fixed build order (includes Esports World Cup coverage) — not started yet."]}
    />
  );
}
