import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// 1. Create a Routine
export const createRoutine = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      name,
      description,
      labels,
      exercises, // Array of { exerciseId, sets: [{ weight?, reps?, ... }] }
    } = req.body;

    if (!name) {
      res.status(400).json({ error: "Routine name is required" });
      return;
    }

    // Transaction to create routine and all sub-records
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newRoutine = await prisma.$transaction(async (tx: any) => {
      // Create Routine
      const routine = await tx.routine.create({
        data: {
          userId,
          name,
          description,
          labels: labels || [],
        },
      });

      // Add Exercises
      if (exercises && Array.isArray(exercises)) {
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];

          // Create Routine Exercise
          const routineExercise = await tx.routineExercise.create({
            data: {
              routineId: routine.id,
              exerciseId: ex.exerciseId,
              order: i,
            },
          });

          // Create Routine Sets (Targets)
          if (ex.sets && Array.isArray(ex.sets)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setsData = ex.sets.map((s: any, index: number) => ({
              routineExerciseId: routineExercise.id,
              setIndex: index,
              weight: s.weight || null,
              reps: s.reps || null,
              durationSec: s.durationSec || null,
              distance: s.distance || null,
              isHardSet: s.isHardSet !== undefined ? s.isHardSet : true,
            }));

            await tx.routineSet.createMany({
              data: setsData,
            });
          }
        }
      }

      return routine;
    });

    const fullRoutine = await prisma.routine.findUnique({
      where: { id: newRoutine.id },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    res.status(201).json(fullRoutine);
  } catch (error) {
    console.error("Create Routine Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 2. Get All Routines for User
export const getRoutines = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const routines = await prisma.routine.findMany({
      where: { userId },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                id: true,
                name: true,
                category: true,
                primaryMuscles: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { id: "desc" },
    });

    res.status(200).json(routines);
  } catch (error) {
    console.error("Get Routines Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 3. Get Single Routine
export const getRoutineById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const routineId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const routine = await prisma.routine.findFirst({
      where: { id: routineId, userId },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: true,
          },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!routine) {
      res.status(404).json({ error: "Routine not found" });
      return;
    }

    res.status(200).json(routine);
  } catch (error) {
    console.error("Get Routine Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 4. Update Routine
export const updateRoutine = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const routineId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { name, description, labels, exercises } = req.body;

    const existingRoutine = await prisma.routine.findFirst({
      where: { id: routineId, userId },
    });

    if (!existingRoutine) {
      res.status(404).json({ error: "Routine not found" });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedRoutine = await prisma.$transaction(async (tx: any) => {
      // Update basic details
      await tx.routine.update({
        where: { id: routineId },
        data: {
          name,
          description,
          labels,
        },
      });

      // If exercises provided, replace them all
      if (exercises && Array.isArray(exercises)) {
        await tx.routineExercise.deleteMany({
          where: { routineId },
        });

        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];
          const routineExercise = await tx.routineExercise.create({
            data: {
              routineId,
              exerciseId: ex.exerciseId,
              order: i,
            },
          });

          if (ex.sets && Array.isArray(ex.sets)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setsData = ex.sets.map((s: any, index: number) => ({
              routineExerciseId: routineExercise.id,
              setIndex: index,
              weight: s.weight || null,
              reps: s.reps || null,
              durationSec: s.durationSec || null,
              distance: s.distance || null,
              isHardSet: s.isHardSet !== undefined ? s.isHardSet : true,
            }));

            await tx.routineSet.createMany({
              data: setsData,
            });
          }
        }
      }

      return await tx.routine.findUnique({
        where: { id: routineId },
        include: {
          exercises: {
            include: { sets: true, exercise: true },
            orderBy: { order: "asc" },
          },
        },
      });
    });

    res.status(200).json(updatedRoutine);
  } catch (error) {
    console.error("Update Routine Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 5. Delete Routine
export const deleteRoutine = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const routineId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const result = await prisma.routine.deleteMany({
      where: { id: routineId, userId },
    });

    if (result.count === 0) {
      res.status(404).json({ error: "Routine not found or unauthorized" });
      return;
    }

    res.status(200).json({ message: "Routine deleted successfully" });
  } catch (error) {
    console.error("Delete Routine Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
