import { prisma } from "@sports/db";

export async function loadProviderCursors(providerId: string): Promise<Map<string, string>> {
  const rows = await prisma.providerCursor.findMany({
    where: { providerId },
    select: { sessionId: true, cursor: true },
  });
  return new Map(rows.map((row) => [row.sessionId, row.cursor]));
}

export async function saveProviderCursor(providerId: string, sessionId: string, cursor: string): Promise<void> {
  await prisma.providerCursor.upsert({
    where: { providerId_sessionId: { providerId, sessionId } },
    update: { cursor },
    create: { providerId, sessionId, cursor },
  });
}
