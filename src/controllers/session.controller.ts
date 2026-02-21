import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// 1. Create/Log a Workout Session
export const createSession = async (
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
      sessionName,
      routineId, // Optional, if starting from a template
      startTime,
      endTime,
      exercises, // Array of { exerciseId, sets: [{ weight, reps, ... }] }
      labels,
    } = req.body;

    if (!sessionName) {
      res.status(400).json({ error: "Session name is required" });
      return;
    }

    // Transaction to ensure all data is saved together
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newSession = await prisma.$transaction(async (tx: any) => {
      // Create the main session record
      const session = await tx.workoutSession.create({
        data: {
          userId,
          routineId: routineId || null,
          sessionName,
          labels: labels || [],
          startTime: startTime ? new Date(startTime) : new Date(),
          endTime: endTime ? new Date(endTime) : null,
        },
      });

      // If exercises are provided, add them (Entry Flow Step 3/4)
      if (exercises && Array.isArray(exercises)) {
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];

          // Create Exercise Entry
          const entry = await tx.exerciseEntry.create({
            data: {
              sessionId: session.id,
              exerciseId: ex.exerciseId,
              order: i,
            },
          });

          // Create Sets for this exercise
          if (ex.sets && Array.isArray(ex.sets)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setsData = ex.sets.map((s: any, index: number) => ({
              exerciseEntryId: entry.id,
              setIndex: index,
              weight: s.weight || 0,
              reps: s.reps || 0,
              isHardSet: s.isHardSet !== undefined ? s.isHardSet : true,
            }));

            await tx.set.createMany({
              data: setsData,
            });
          }
        }
      }

      return session;
    });

    // Fetch the fully created object to return nicely
    const fullSession = await prisma.workoutSession.findUnique({
      where: { id: newSession.id },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: { include: {} }, // Include global exercise details
          },
          orderBy: { order: "asc" },
        },
      },
    });

    res.status(201).json(fullSession);
  } catch (error) {
    console.error("Create Session Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Modify existing getSessions to support time filtering
export const getSessions = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Time filter
    const filter = req.query.filter as string;
    let dateFilter = {};

    if (filter === "today") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dateFilter = { startTime: { gte: today } };
    } else if (filter === "week") {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      dateFilter = { startTime: { gte: weekAgo } };
    } else if (filter === "month") {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      dateFilter = { startTime: { gte: monthAgo } };
    }

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      skip,
      take: limit,
      orderBy: { startTime: "desc" },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: { select: { name: true, category: true } },
          },
          orderBy: { order: "asc" },
        },
      },
    });

    // Calculate stats for each session
    const sessionsWithStats = sessions.map((session) => {
      const totalVolume = session.exercises.reduce((total, exercise) => {
        return (
          total +
          exercise.sets.reduce((setTotal, set) => {
            return setTotal + set.weight * set.reps;
          }, 0)
        );
      }, 0);

      const duration = session.endTime
        ? (session.endTime.getTime() - session.startTime.getTime()) / 1000 / 60
        : null;

      return {
        ...session,
        stats: {
          totalVolume,
          duration,
          exerciseCount: session.exercises.length,
          totalSets: session.exercises.reduce(
            (total, ex) => total + ex.sets.length,
            0,
          ),
        },
      };
    });

    const total = await prisma.workoutSession.count({
      where: {
        userId,
        ...dateFilter,
      },
    });

    res.status(200).json({
      data: sessionsWithStats,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get Sessions Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 3. Get Single Session Details
export const getSessionById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const sessionId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }

    const session = await prisma.workoutSession.findFirst({
      where: {
        id: sessionId,
        userId: userId, // Ensure user owns the session
      },
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

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    res.status(200).json(session);
  } catch (error) {
    console.error("Get Session Details Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 4. Delete Session
export const deleteSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const sessionId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }

    // Verify ownership
    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!session) {
      res.status(404).json({ error: "Session not found or unauthorized" });
      return;
    }

    await prisma.workoutSession.delete({
      where: { id: sessionId },
    });

    res.status(200).json({ message: "Session deleted successfully" });
  } catch (error) {
    console.error("Delete Session Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 5. Update Session (Sync full workout state)
export const updateSession = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const sessionId = parseInt(req.params.id as string);

    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }

    const {
      sessionName,
      endTime,
      exercises, // Full array of current state
      labels,
    } = req.body;

    // Verify ownership
    const existingSession = await prisma.workoutSession.findUnique({
      where: { id: sessionId },
    });

    if (!existingSession || existingSession.userId !== userId) {
      res.status(404).json({ error: "Session not found or unauthorized" });
      return;
    }

    // Transaction: Update Session Metadata & Replace Exercises
    const updatedSession = await prisma.$transaction(async (tx: any) => {
      // 1. Update basic info
      await tx.workoutSession.update({
        where: { id: sessionId },
        data: {
          sessionName,
          labels: labels,
          endTime: endTime ? new Date(endTime) : undefined, // Only update if provided
        },
      });

      // 2. If exercises provided, Replace All (Simplest Sync Strategy)
      if (exercises && Array.isArray(exercises)) {
        // A. Delete all existing entries for this session (cascade deletes sets)
        await tx.exerciseEntry.deleteMany({
          where: { sessionId },
        });

        // B. Re-create everything from current state
        for (let i = 0; i < exercises.length; i++) {
          const ex = exercises[i];

          // Create Exercise Entry
          const entry = await tx.exerciseEntry.create({
            data: {
              sessionId,
              exerciseId: ex.exerciseId,
              order: i,
            },
          });

          // Create Sets
          if (ex.sets && Array.isArray(ex.sets)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const setsData = ex.sets.map((s: any, index: number) => ({
              exerciseEntryId: entry.id,
              setIndex: index,
              weight: s.weight || 0,
              reps: s.reps || 0,
              isHardSet: s.isHardSet !== undefined ? s.isHardSet : true,
            }));

            await tx.set.createMany({
              data: setsData,
            });
          }
        }
      }

      return await tx.workoutSession.findUnique({
        where: { id: sessionId },
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
    });

    res.status(200).json(updatedSession);
  } catch (error) {
    console.error("Update Session Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// GET /api/sessions/stats/calendar
export const getCalendarStats = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Get date range from query (default to last 30 days)
    const days = parseInt(req.query.days as string) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        startTime: { gte: startDate },
      },
      include: {
        exercises: {
          include: {
            sets: true,
          },
        },
      },
    });

    // Group by date and calculate stats
    const calendarData = sessions.reduce((acc: any, session) => {
      const date = session.startTime.toISOString().split("T")[0];

      const volume = session.exercises.reduce((total, exercise) => {
        return (
          total +
          exercise.sets.reduce((setTotal, set) => {
            return setTotal + set.weight * set.reps;
          }, 0)
        );
      }, 0);

      if (!acc[date]) {
        acc[date] = {
          date,
          workouts: 0,
          totalVolume: 0,
          duration: 0,
        };
      }

      acc[date].workouts += 1;
      acc[date].totalVolume += volume;

      if (session.endTime) {
        const duration =
          (session.endTime.getTime() - session.startTime.getTime()) / 1000 / 60;
        acc[date].duration += duration;
      }

      return acc;
    }, {});

    res.status(200).json(Object.values(calendarData));
  } catch (error) {
    console.error("Get Calendar Stats Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
