import { notFound } from "next/navigation";
import { getF1Fixture } from "../../../lib/f1Api";
import { ApiError } from "../../../lib/api";
import { F1EventCenter } from "../../../components/event-center/f1/F1EventCenter";

/** Renders a real F1 Fixture by id; unknown prefixes and missing fixtures are 404s. */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (id.startsWith("f1-")) {
    let data: Awaited<ReturnType<typeof getF1Fixture>>;
    try {
      data = await getF1Fixture(id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound();
      }
      throw error; // caught by error.tsx
    }
    return <F1EventCenter fixture={data.fixture} sessions={data.sessions} />;
  }

  notFound();
}
