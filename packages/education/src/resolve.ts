import type { EducationConcept } from "@sports/domain";

/** In-memory index over a loaded concept set — see ARCHITECTURE.md §6. */
export class EducationIndex {
  private readonly bySlug = new Map<string, EducationConcept>();
  private readonly byEventType = new Map<string, EducationConcept[]>();

  constructor(concepts: EducationConcept[]) {
    for (const concept of concepts) {
      this.bySlug.set(concept.slug, concept);
      for (const eventType of concept.relatedEventTypes) {
        const existing = this.byEventType.get(eventType) ?? [];
        existing.push(concept);
        this.byEventType.set(eventType, existing);
      }
    }
  }

  get(slug: string): EducationConcept | undefined {
    return this.bySlug.get(slug);
  }

  /** "What does this mean?" — contextual help surfaced from a live LiveEvent. */
  forEventType(eventType: string): EducationConcept[] {
    return this.byEventType.get(eventType) ?? [];
  }

  /** Concepts this one links to, resolved from slugs to full concepts. */
  related(slug: string): EducationConcept[] {
    return (
      this.get(slug)
        ?.relatedConceptSlugs.map((s) => this.bySlug.get(s))
        .filter((c): c is EducationConcept => Boolean(c)) ?? []
    );
  }

  /** "Why did this happen?" */
  precededBy(slug: string): EducationConcept[] {
    return (
      this.get(slug)
        ?.precededBy.map((s) => this.bySlug.get(s))
        .filter((c): c is EducationConcept => Boolean(c)) ?? []
    );
  }

  /** "What happens next?" */
  followedBy(slug: string): EducationConcept[] {
    return (
      this.get(slug)
        ?.followedBy.map((s) => this.bySlug.get(s))
        .filter((c): c is EducationConcept => Boolean(c)) ?? []
    );
  }

  all(): EducationConcept[] {
    return [...this.bySlug.values()];
  }

  forSport(sport: string): EducationConcept[] {
    return this.all().filter((c) => c.sport === sport);
  }
}
