import type { Metadata } from "next";
import { ComingSoon } from "../../../components/ComingSoon";

export const metadata: Metadata = { title: "Football — Sports Platform" };

export default function FootballComingSoonPage() {
  return (
    <ComingSoon
      sport="Football"
      status="Planned"
      progress={["Scheduled after Cricket in the fixed build order — not started yet."]}
    />
  );
}
