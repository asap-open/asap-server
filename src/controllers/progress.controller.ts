import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// Helper to get date range filter
const getDateFilter = (range: string) => {
  const now = new Date();
  const filter: any = {};

  if (range === "1W") {
    const date = new Date();
    date.setDate(date.getDate() - 7);
    filter.startTime = { gte: date };
  } else if (range === "1M") {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    filter.startTime = { gte: date };
  } else if (range === "3M") {
    const date = new Date();
    date.setMonth(date.getMonth() - 3);
    filter.startTime = { gte: date };
  } else if (range === "6M") {
    const date = new Date();
    date.setMonth(date.getMonth() - 6);
    filter.startTime = { gte: date };
  } else if (range === "1Y") {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    filter.startTime = { gte: date };
  }
  // "ALL" returns empty filter (all time)

  return filter;
};

// 1. Consistency Heatmap (Calendar)
export const getConsistency = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { range } = req.query;
    const dateFilter = getDateFilter(range as string);

    // Group by date (this requires raw query or JS processing since Prisma groupBy on date part is tricky across DBs)
    // For simplicity and DB independence, let's fetch session dates and process in JS.
    // If scale becomes an issue, we'd move to raw SQL.

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      select: {
        startTime: true,
      },
      orderBy: { startTime: "asc" },
    });

    // Process: Map dates to counts
    const consistencyMap = new Map<string, number>();

    sessions.forEach((session) => {
      const dateStr = session.startTime.toISOString().split("T")[0]; // YYYY-MM-DD
      consistencyMap.set(dateStr, (consistencyMap.get(dateStr) || 0) + 1);
    });

    const data = Array.from(consistencyMap.entries()).map(([day, value]) => ({
      day,
      value,
    }));

    res.json(data);
  } catch (error) {
    console.error("Get Consistency Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 2. Volume Stats (Bar Chart)
export const getVolumeStats = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { range } = req.query;
    const dateFilter = getDateFilter(range as string);

    // We need sessions -> exercises -> sets
    // Valid volume = weight * reps. Only counting "hard" sets usually, but let's count all non-warmup or just all.
    // Schema has isHardSet, maybe use that later. For now, sum all.

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      include: {
        exercises: {
          include: {
            sets: true,
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // Process data to group by Day
    const volumeMap = new Map<string, number>();

    sessions.forEach((session) => {
      const dateStr = session.startTime.toISOString().split("T")[0];
      let sessionVolume = 0;

      session.exercises.forEach((ex) => {
        ex.sets.forEach((set) => {
          // Simple volume calculation: weight * reps
          // Ignore cardio for "volume" chart usually, or treat differently.
          // If weight is 0 (bodyweight), maybe just count reps? Usually 0 volume in powerlifting context.
          sessionVolume += set.weight * set.reps;
        });
      });

      volumeMap.set(dateStr, (volumeMap.get(dateStr) || 0) + sessionVolume);
    });

    const data = Array.from(volumeMap.entries()).map(([day, volume]) => ({
      day,
      volume,
    }));

    res.json(data);
  } catch (error) {
    console.error("Get Volume Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 3. Muscle Distribution (Radar)
export const getMuscleDistribution = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { range } = req.query;
    const dateFilter = getDateFilter(range as string);

    // Get all exercises performed in range
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                primaryMuscles: true,
              },
            },
          },
        },
      },
    });

    const muscleCounts: Record<string, number> = {};

    sessions.forEach((session) => {
      session.exercises.forEach((entry) => {
        // We can weight this by NUMBER of sets performed
        const setCode = entry.sets.length;
        const muscles = entry.exercise.primaryMuscles as string[]; // Cast JSON

        if (Array.isArray(muscles)) {
          muscles.forEach((muscle) => {
            muscleCounts[muscle] = (muscleCounts[muscle] || 0) + setCode;
          });
        }
      });
    });

    // Format for Nivo Radar: { muscle: 'Chest', value: 30 }
    const data = Object.entries(muscleCounts).map(([muscle, value]) => ({
      muscle,
      value,
    }));

    // Sort by value (optional) or just send
    res.json(data);
  } catch (error) {
    console.error("Get Muscle Dist Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 4. Personal Bests
export const getPersonalBests = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { exerciseIds } = req.query;
    if (!exerciseIds) {
      res.status(400).json({ error: "Please provide exerciseIds to monitor" });
      return;
    }
    const whereClause: any = {
      session: { userId },
    };
    if (exerciseIds) {
      const ids =
        typeof exerciseIds === "string"
          ? exerciseIds.split(",")
          : (exerciseIds as string[]);

      if (ids.length > 0) {
        whereClause.exerciseId = { in: ids };
      } else {
        res.json([]);
        return;
      }
    }

    const entries = await prisma.exerciseEntry.findMany({
      where: whereClause,
      select: {
        exerciseId: true,
        exercise: { select: { name: true } },
        sets: {
          select: { weight: true, reps: true },
        },
        session: { select: { startTime: true } },
      },
    });

    const pbMap = new Map<
      string,
      { exerciseId: string; exercise: string; weight: number; date: Date }
    >();

    entries.forEach((entry) => {
      // Find max weight in this entry
      let maxWeightInEntry = 0;
      entry.sets.forEach((s) => {
        if (s.weight > maxWeightInEntry) maxWeightInEntry = s.weight;
      });

      const currentPB = pbMap.get(entry.exerciseId);
      if (!currentPB || maxWeightInEntry > currentPB.weight) {
        pbMap.set(entry.exerciseId, {
          exerciseId: entry.exerciseId,
          exercise: entry.exercise.name,
          weight: maxWeightInEntry,
          date: entry.session.startTime,
        });
      }
    });

    const data = Array.from(pbMap.values()).sort((a, b) => b.weight - a.weight);

    res.json(data);
  } catch (error) {
    console.error("Get PBs Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
