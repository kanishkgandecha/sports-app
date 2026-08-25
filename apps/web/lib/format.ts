/** Compact date formatting shared by F1 dashboard and archive views. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Compact date and time formatting for precise session starts. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Name, Country" when a country is known, otherwise just the venue name. */
export function venueLine(venue: { name: string; country: string | null } | null): string | null {
  if (!venue) return null;
  return venue.country ? `${venue.name}, ${venue.country}` : venue.name;
}
