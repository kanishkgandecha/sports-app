export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) {
    // Status carried on the error so callers can tell "genuinely not
    // found" (404) apart from "the API is unreachable/erroring" (anything
    // else) — see apps/web/app/events/[id]/page.tsx, which renders a
    // different state for each rather than treating every failure as 404.
    throw new ApiError(`GET ${path} failed: ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}
