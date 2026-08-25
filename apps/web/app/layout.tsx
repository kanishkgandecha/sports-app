import type { Metadata } from "next";
import { displayFont } from "./fonts";
import { SiteNav } from "../components/nav/SiteNav";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "F1 Race Center", template: "%s — F1 Race Center" },
  description: "Formula 1 timing, results, standings, archives, and plain-language race education.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={displayFont.variable}>
      <body>
        <SiteNav />
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
