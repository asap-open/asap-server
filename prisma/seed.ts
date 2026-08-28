import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";
import { prisma } from "../src/utils/prisma.js";
import { SessionLabel, UnitPreference, Gender } from "./generated/enums.js";

const USERS_TO_SEED = [
  {
    username: "dev",
    email: "dev@asap.local",
    fullName: "Dev User",
    password: "password123",
  },
  {
    username: "devadmin",
    email: "devadmin@asap.local",
    fullName: "Dev Admin",
    password: "password123",
  },
];

const EXERCISES = [
  // Push / Chest / Shoulders / Triceps
  {
    id: "barbell-bench-press",
    name: "Barbell Bench Press",
    category: "Strength",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["chest"],
    secondaryMuscles: ["triceps", "front delts"],
    labels: [SessionLabel.Chest, SessionLabel.Arms],
    baseWeight: 60,
    weightStep: 0.3,
  },
  {
    id: "incline-dumbbell-press",
    name: "Incline Dumbbell Press",
    category: "Strength",
    equipment: "Dumbbell",
    isBodyweightExercise: false,
    primaryMuscles: ["chest", "front delts"],
    secondaryMuscles: ["triceps"],
    labels: [SessionLabel.Chest, SessionLabel.Shoulders],
    baseWeight: 22,
    weightStep: 0.15,
  },
  {
    id: "overhead-press",
    name: "Overhead Shoulder Press",
    category: "Strength",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["triceps", "upper chest"],
    labels: [SessionLabel.Shoulders, SessionLabel.Arms],
    baseWeight: 40,
    weightStep: 0.2,
  },
  {
    id: "lateral-raise",
    name: "Dumbbell Lateral Raise",
    category: "Hypertrophy",
    equipment: "Dumbbell",
    isBodyweightExercise: false,
    primaryMuscles: ["shoulders"],
    secondaryMuscles: ["traps"],
    labels: [SessionLabel.Shoulders],
    baseWeight: 10,
    weightStep: 0.05,
  },
  {
    id: "tricep-pushdown",
    name: "Cable Tricep Pushdown",
    category: "Hypertrophy",
    equipment: "Cable",
    isBodyweightExercise: false,
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    labels: [SessionLabel.Arms],
    baseWeight: 25,
    weightStep: 0.15,
  },

  // Pull / Back / Biceps
  {
    id: "barbell-deadlift",
    name: "Conventional Deadlift",
    category: "Strength",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["back", "hamstrings"],
    secondaryMuscles: ["glutes", "traps", "forearms"],
    labels: [SessionLabel.Back, SessionLabel.Legs],
    baseWeight: 100,
    weightStep: 0.5,
  },
  {
    id: "pull-up",
    name: "Pull-Up",
    category: "Strength",
    equipment: "Bodyweight",
    isBodyweightExercise: true,
    primaryMuscles: ["lats", "back"],
    secondaryMuscles: ["biceps"],
    labels: [SessionLabel.Back, SessionLabel.Arms],
    baseWeight: 0,
    weightStep: 0,
  },
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    category: "Hypertrophy",
    equipment: "Cable",
    isBodyweightExercise: false,
    primaryMuscles: ["lats", "back"],
    secondaryMuscles: ["biceps"],
    labels: [SessionLabel.Back],
    baseWeight: 55,
    weightStep: 0.25,
  },
  {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    category: "Hypertrophy",
    equipment: "Cable",
    isBodyweightExercise: false,
    primaryMuscles: ["back", "rhomboids"],
    secondaryMuscles: ["biceps", "rear delts"],
    labels: [SessionLabel.Back],
    baseWeight: 50,
    weightStep: 0.25,
  },
  {
    id: "barbell-curl",
    name: "Barbell Bicep Curl",
    category: "Hypertrophy",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    labels: [SessionLabel.Arms],
    baseWeight: 25,
    weightStep: 0.15,
  },

  // Legs / Glutes / Core
  {
    id: "barbell-squat",
    name: "Barbell Back Squat",
    category: "Strength",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "calves", "core"],
    labels: [SessionLabel.Legs, SessionLabel.Glutes],
    baseWeight: 80,
    weightStep: 0.45,
  },
  {
    id: "leg-press",
    name: "Leg Press",
    category: "Hypertrophy",
    equipment: "Machine",
    isBodyweightExercise: false,
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["calves"],
    labels: [SessionLabel.Legs],
    baseWeight: 140,
    weightStep: 0.8,
  },
  {
    id: "romanian-deadlift",
    name: "Romanian Deadlift (RDL)",
    category: "Hypertrophy",
    equipment: "Barbell",
    isBodyweightExercise: false,
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower back"],
    labels: [SessionLabel.Legs, SessionLabel.Glutes],
    baseWeight: 70,
    weightStep: 0.35,
  },
  {
    id: "hanging-leg-raise",
    name: "Hanging Leg Raise",
    category: "Hypertrophy",
    equipment: "Bodyweight",
    isBodyweightExercise: true,
    primaryMuscles: ["core", "abs"],
    secondaryMuscles: ["obliques"],
    labels: [SessionLabel.Core],
    baseWeight: 0,
    weightStep: 0,
  },
];

async function seed() {
  console.log("🌱 Starting database seeding with Faker...");

  // 1. Seed Global Exercises
  console.log("Creating/updating global exercises...");
  for (const ex of EXERCISES) {
    await prisma.globalExercise.upsert({
      where: { id: ex.id },
      update: {
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        isBodyweightExercise: ex.isBodyweightExercise,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
        updatedAt: new Date(),
      },
      create: {
        id: ex.id,
        name: ex.name,
        category: ex.category,
        equipment: ex.equipment,
        isBodyweightExercise: ex.isBodyweightExercise,
        primaryMuscles: ex.primaryMuscles,
        secondaryMuscles: ex.secondaryMuscles,
        isCustom: false,
        createdBy: null,
      },
    });
  }

  // 2. Seed Users
  for (const target of USERS_TO_SEED) {
    console.log(`\n👤 Seeding user: ${target.username} (${target.email})...`);

    const passwordHash = await bcrypt.hash(target.password, 10);

    const user = await prisma.user.upsert({
      where: { username: target.username },
      update: {
        email: target.email,
        passwordHash,
      },
      create: {
        username: target.username,
        email: target.email,
        passwordHash,
      },
    });

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      update: {
        fullName: target.fullName,
        latestWeightKg: 78.5,
        targetWeightKg: 75.0,
        heightCm: 178,
        unitPref: UnitPreference.kg,
        gender: Gender.male,
      },
      create: {
        userId: user.id,
        fullName: target.fullName,
        latestWeightKg: 78.5,
        targetWeightKg: 75.0,
        heightCm: 178,
        unitPref: UnitPreference.kg,
        gender: Gender.male,
      },
    });

    // Clean up old sessions and weight logs for a fresh realistic timeline
    await prisma.set.deleteMany({
      where: { exerciseEntry: { session: { userId: user.id } } },
    });
    await prisma.exerciseEntry.deleteMany({
      where: { session: { userId: user.id } },
    });
    await prisma.workoutSession.deleteMany({
      where: { userId: user.id },
    });
    await prisma.weightLog.deleteMany({
      where: { userId: user.id },
    });

    // 3. Generate 110 realistic workout sessions over the past 365 days
    console.log(`Generating ~110 realistic workouts for ${target.username}...`);

    const pushExercises = EXERCISES.filter((e) =>
      e.labels.some((l) => [SessionLabel.Chest, SessionLabel.Shoulders, SessionLabel.Arms].includes(l)),
    );
    const pullExercises = EXERCISES.filter((e) =>
      e.labels.some((l) => [SessionLabel.Back, SessionLabel.Arms].includes(l)),
    );
    const legExercises = EXERCISES.filter((e) =>
      e.labels.some((l) => [SessionLabel.Legs, SessionLabel.Glutes, SessionLabel.Core].includes(l)),
    );

    const sessionSplits = [
      {
        name: "Push Strength & Hypertrophy",
        labels: [SessionLabel.Chest, SessionLabel.Shoulders, SessionLabel.Arms],
        exercises: pushExercises,
      },
      {
        name: "Pull & Bicep Power",
        labels: [SessionLabel.Back, SessionLabel.Arms],
        exercises: pullExercises,
      },
      {
        name: "Legs & Core Overload",
        labels: [SessionLabel.Legs, SessionLabel.Glutes, SessionLabel.Core],
        exercises: legExercises,
      },
      {
        name: "Full Body Blitz",
        labels: [SessionLabel.FullBody, SessionLabel.Core],
        exercises: [
          EXERCISES.find((e) => e.id === "barbell-bench-press")!,
          EXERCISES.find((e) => e.id === "barbell-squat")!,
          EXERCISES.find((e) => e.id === "pull-up")!,
          EXERCISES.find((e) => e.id === "hanging-leg-raise")!,
        ],
      },
    ];

    const today = new Date();

    // Create workouts with 3-4 days on / rest patterns over the year
    for (let dayOffset = 360; dayOffset >= 0; dayOffset -= faker.helpers.arrayElement([1, 2, 2, 3])) {
      const sessionDate = new Date(today);
      sessionDate.setDate(sessionDate.getDate() - dayOffset);
      sessionDate.setHours(faker.number.int({ min: 8, max: 19 }), faker.number.int({ min: 0, max: 59 }), 0, 0);

      const split = faker.helpers.arrayElement(sessionSplits);
      const durationMin = faker.number.int({ min: 45, max: 75 });
      const endDate = new Date(sessionDate.getTime() + durationMin * 60000);

      const session = await prisma.workoutSession.create({
        data: {
          userId: user.id,
          sessionName: `${faker.word.adjective()} ${split.name}`,
          labels: split.labels,
          startTime: sessionDate,
          endTime: endDate,
        },
      });

      // Pick 3-4 exercises for this session
      const chosenExercises = faker.helpers.arrayElements(split.exercises, faker.number.int({ min: 3, max: 4 }));

      for (let order = 0; order < chosenExercises.length; order++) {
        const ex = chosenExercises[order]!;
        const entry = await prisma.exerciseEntry.create({
          data: {
            sessionId: session.id,
            exerciseId: ex.id,
            order: order + 1,
            isTimeBased: false,
          },
        });

        // Calculate progressive weight based on how recent the workout is
        const progressFactor = (360 - dayOffset); // 0 at 360 days ago -> 360 today
        const calcWeight = Math.round(ex.baseWeight + progressFactor * ex.weightStep);

        const setCount = faker.number.int({ min: 3, max: 4 });
        for (let s = 1; s <= setCount; s++) {
          await prisma.set.create({
            data: {
              exerciseEntryId: entry.id,
              setIndex: s,
              weight: ex.isBodyweightExercise ? 0 : Math.max(10, calcWeight + (s * 2.5) + faker.number.int({ min: -2, max: 3 })),
              reps: ex.isBodyweightExercise ? faker.number.int({ min: 8, max: 15 }) : faker.number.int({ min: 6, max: 12 }),
              isHardSet: true,
            },
          });
        }
      }
    }

    // 4. Generate ~50 regular weight logs across the year showing realistic cut
    console.log(`Generating weight history logs for ${target.username}...`);
    for (let dayOffset = 360; dayOffset >= 0; dayOffset -= faker.number.int({ min: 5, max: 9 })) {
      const logDate = new Date(today);
      logDate.setDate(logDate.getDate() - dayOffset);
      logDate.setHours(7, 30, 0, 0);

      // Start ~83kg -> drop to ~77.5kg with slight natural noise
      const progress = (360 - dayOffset) / 360;
      const weight = Number((83.0 - progress * 5.5 + faker.number.float({ min: -0.4, max: 0.4 })).toFixed(1));

      await prisma.weightLog.create({
        data: {
          userId: user.id,
          weightKg: weight,
          recordedAt: logDate,
        },
      });
    }

    console.log(`✅ Finished seeding for ${target.username}`);
  }

  console.log("\n🎉 All database dummy data seeded successfully with Faker!");
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
