/**
 * Jolpica `constructorId` -> our canonical team slug (the slug already
 * stored on our real `Team` rows, bootstrapped by `OpenF1Adapter` from
 * OpenF1's `team_name`). This table exists because team identity does NOT
 * bridge automatically between the two providers the way driver identity
 * does via car number (see packages/providers/f1/shared/src/reference.ts's
 * module doc, and docs/CONTEXT.md Checkpoint 6 §2).
 *
 * Verified by direct comparison against real rows in our own `Team` table
 * (`docker exec sports-platform-db psql ... 'select id, name, slug from
 * "Team"'`) against a real `/2026/constructorstandings/` response, at
 * Checkpoint 6. 5 of 11 constructors differ from a naive slugify of
 * Jolpica's own `constructorId`:
 *
 *   constructorId   Jolpica name        naive slug        our real slug
 *   --------------  ------------------  ----------------  -------------------
 *   red_bull        Red Bull            red-bull          red-bull-racing
 *   rb              RB F1 Team          rb                racing-bulls        (name differs too)
 *   haas            Haas F1 Team        haas-f1-team       haas-f1-team        (matches, listed for completeness)
 *   aston_martin    Aston Martin        aston-martin       aston-martin        (matches, delimiter only)
 *   cadillac        Cadillac            cadillac           cadillac            (matches)
 *
 * Only entries that would otherwise resolve WRONG via naive slugify are
 * strictly required; the full list is included anyway so every real 2026
 * constructor is explicit and reviewable in one place, rather than mixing
 * "explicit override" and "falls through to slugify" silently.
 */
export const JOLPICA_CONSTRUCTOR_TO_TEAM_SLUG: Record<string, string> = {
  mercedes: "mercedes",
  ferrari: "ferrari",
  mclaren: "mclaren",
  red_bull: "red-bull-racing",
  rb: "racing-bulls",
  alpine: "alpine",
  haas: "haas-f1-team",
  audi: "audi",
  williams: "williams",
  aston_martin: "aston-martin",
  cadillac: "cadillac",
  sauber: "kick-sauber",
};

/**
 * Resolves a Jolpica constructor to our canonical team slug. Falls back to
 * slugifying Jolpica's own `constructorId` for anything not in the table
 * (rather than throwing) — a new/renamed constructor entering next season
 * shouldn't take standings ingestion down; it's logged so the gap doesn't
 * go unnoticed, same resilience posture as OpenF1Adapter's `mapSessionType`
 * fallback (packages/providers/f1/openf1/src/sessionType.ts).
 */
export function resolveTeamSlug(constructorId: string): string {
  const mapped = JOLPICA_CONSTRUCTOR_TO_TEAM_SLUG[constructorId];
  if (mapped) return mapped;
  console.warn(
    `[jolpica] Unrecognized constructorId "${constructorId}" — falling back to a slugified version of the id itself. Add it to JOLPICA_CONSTRUCTOR_TO_TEAM_SLUG once its real canonical slug is known.`,
  );
  return constructorId.replace(/_/g, "-");
}
