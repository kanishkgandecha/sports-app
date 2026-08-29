import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteNav } from "./SiteNav";

let pathname = "/";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

afterEach(cleanup);

describe("SiteNav", () => {
  it.each(["/", "/sports/f1", "/events/f1-meeting-1292"])("keeps Race Center active for %s", (route) => {
    pathname = route;
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: "Race Center" })).toHaveAttribute("aria-current", "page");
  });

  it("marks the archive as the current top-level destination", () => {
    pathname = "/archive";
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: "Archive" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Race Center" })).not.toHaveAttribute("aria-current");
  });
});
