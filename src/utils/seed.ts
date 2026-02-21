// Use the shared prisma instance which is correctly configured with the adapter
import { prisma } from "./prisma.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log("Start seeding...");

  const exercisesPath = path.resolve(__dirname, "../../data/exercises.json");

  if (!fs.existsSync(exercisesPath)) {
    console.error(`File not found: ${exercisesPath}`);
    return;
  }

  const rawData = fs.readFileSync(exercisesPath, "utf-8");
  const exercises = JSON.parse(rawData);

  console.log(`Found ${exercises.length} exercises to seed.`);

  const formattedExercises = exercises.map((ex: any) => ({
    id: ex.id,
    name: ex.name,
    category: ex.category || "strength",
    equipment: ex.equipment || "body only",
    primaryMuscles: ex.primaryMuscles || [],
    secondaryMuscles: ex.secondaryMuscles || [],
    instructions: Array.isArray(ex.instructions)
      ? ex.instructions.join("\n")
      : ex.instructions || "",
    isCustom: false,
    createdBy: null,
  }));

  // Batch insert to avoid too many connections/time
  const chunkSize = 100;
  for (let i = 0; i < formattedExercises.length; i += chunkSize) {
    const chunk = formattedExercises.slice(i, i + chunkSize);
    await prisma.globalExercise.createMany({
      data: chunk,
      skipDuplicates: true, // Important: Don't crash if re-running seed
    });
    console.log(`Seeded batch ${i / chunkSize + 1}`);
  }

  console.log("Seeding finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
