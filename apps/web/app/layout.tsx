import type { Metadata } from "next";
import { headers } from "next/headers";
import { displayFont } from "./fonts";
import { SiteNav } from "../components/nav/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "F1 Race Center", template: "%s — F1 Race Center" },
  description: "Formula 1 timing, results, standings, archives, and plain-language race education.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={displayFont.variable}>
      <body>
        {/* Phase 5 — a single nonce'd, initially-empty stylesheet, rendered
            once here (root layout is never re-rendered by a client-side
            navigation between this app's routes) so its nonce always
            matches what the browser is actually enforcing for the whole
            session. components/TeamColorDot.tsx appends rules into it via
            the CSSOM rather than rendering its own per-instance <style>
            tag — see that component's doc comment for why. */}
        <style id="dynamic-team-colors" nonce={nonce} />
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <SiteNav />
        <main id="main-content" className="page-shell" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
