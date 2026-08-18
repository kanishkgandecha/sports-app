import { prisma } from "../src/index.js";

/**
 * Phase 0 seed: only the sport registry. Real competitions/fixtures start
 * arriving via the ingestion worker once a phase's provider is wired in —
 * this script does not invent placeholder data for sports that aren't
 * implemented yet (ARCHITECTURE.md §7 / master brief §24).
 */
async function main() {
  await prisma.sport.createMany({
    data: [
      { slug: "f1", name: "Formula 1", status: "beta" },
      { slug: "cricket", name: "Cricket", status: "education-only" },
      { slug: "football", name: "Football", status: "education-only" },
      { slug: "esports", name: "Esports", status: "education-only" },
    ],
    skipDuplicates: true,
  });

  console.log("Seeded sport registry.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
