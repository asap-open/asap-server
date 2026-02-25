import { Response } from "express";
import { PBMetric } from "../../prisma/generated/enums.js";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Epley estimated 1-rep max */
const epley1RM = (weight: number, reps: number): number =>
  reps === 1 ? weight : weight * (1 + reps / 30);

interface CandidatePB {
  metric: PBMetric;
  value: number;
  setId: number;
  achievedAt: Date;
}

/**
 * Given all sets for one exercise (across all entries/sessions), compute the
 * best value per metric alongside the set + date it was achieved.
 */
function computePBsForSets(
  sets: {
    id: number;
    weight: number;
    reps: number;
    durationSec: number | null;
    distance: number | null;
    achievedAt: Date;
  }[],
): CandidatePB[] {
  const best: Partial<Record<PBMetric, CandidatePB>> = {};

  const tryUpdate = (
    metric: PBMetric,
    value: number,
    setId: number,
    achievedAt: Date,
  ) => {
    if (!value || value <= 0) return;
    const current = best[metric];
    if (!current || value > current.value) {
      best[metric] = { metric, value, setId, achievedAt };
    }
  };

  for (const s of sets) {
    tryUpdate(PBMetric.MaxWeight, s.weight, s.id, s.achievedAt);
    tryUpdate(PBMetric.MaxReps, s.reps, s.id, s.achievedAt);
    tryUpdate(PBMetric.MaxVolume, s.weight * s.reps, s.id, s.achievedAt);
    tryUpdate(PBMetric.Max1RM, epley1RM(s.weight, s.reps), s.id, s.achievedAt);
    if (s.durationSec)
      tryUpdate(PBMetric.MaxDuration, s.durationSec, s.id, s.achievedAt);
    if (s.distance)
      tryUpdate(PBMetric.MaxDistance, s.distance, s.id, s.achievedAt);
  }

  return Object.values(best) as CandidatePB[];
}

// ─── 1. GET /api/pbs ─────────────────────────────────────────────────────────
export const getAllPBs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { metric, exerciseId, exerciseIds } = req.query;

    // exerciseIds = comma-separated list (widget use), exerciseId = single
    const exerciseIdFilter = exerciseIds
      ? { exerciseId: { in: (exerciseIds as string).split(",") } }
      : exerciseId
        ? { exerciseId: exerciseId as string }
        : {};

    const pbs = await prisma.personalBest.findMany({
      where: {
        userId,
        ...(metric ? { metric: metric as PBMetric } : {}),
        ...exerciseIdFilter,
      },
      include: {
        exercise: { select: { id: true, name: true, category: true } },
        session: { select: { id: true, sessionName: true, startTime: true } },
      },
      orderBy: [{ exercise: { name: "asc" } }, { metric: "asc" }],
    });

    res.json(pbs);
  } catch (error) {
    console.error("Get All PBs Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── 2. GET /api/pbs/:exerciseId ─────────────────────────────────────────────
export const getPBsByExercise = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { exerciseId } = req.params as { exerciseId: string };

    const pbs = await prisma.personalBest.findMany({
      where: { userId, exerciseId },
      include: {
        exercise: { select: { id: true, name: true, category: true } },
        session: { select: { id: true, sessionName: true, startTime: true } },
      },
      orderBy: { metric: "asc" },
    });

    res.json(pbs);
  } catch (error) {
    console.error("Get PBs By Exercise Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── 3. POST /api/pbs/sync ───────────────────────────────────────────────────
/** Full recalculate from the user's entire history. Safe to call any time. */
export const syncAllPBs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Fetch every set the user has ever logged, grouped by exercise
    const entries = await prisma.exerciseEntry.findMany({
      where: { session: { userId } },
      select: {
        exerciseId: true,
        sets: {
          select: {
            id: true,
            weight: true,
            reps: true,
            durationSec: true,
            distance: true,
          },
        },
        session: { select: { id: true, startTime: true } },
      },
    });

    // Group sets by exerciseId, tagging each with its sessionId + achievedAt
    const byExercise = new Map<
      string,
      {
        sessionId: number;
        sets: {
          id: number;
          weight: number;
          reps: number;
          durationSec: number | null;
          distance: number | null;
          achievedAt: Date;
        }[];
      }[]
    >();

    for (const entry of entries) {
      const bucket = byExercise.get(entry.exerciseId) ?? [];
      bucket.push({
        sessionId: entry.session.id,
        sets: entry.sets.map((s) => ({
          ...s,
          achievedAt: entry.session.startTime,
        })),
      });
      byExercise.set(entry.exerciseId, bucket);
    }

    let upsertCount = 0;

    for (const [exerciseId, entriesForExercise] of byExercise) {
      const allSets = entriesForExercise.flatMap((e) => e.sets);
      const candidates = computePBsForSets(allSets);

      for (const candidate of candidates) {
        // Find which sessionId owns this set
        const ownerEntry = entriesForExercise.find((e) =>
          e.sets.some((s) => s.id === candidate.setId),
        );

        await prisma.personalBest.upsert({
          where: {
            userId_exerciseId_metric: {
              userId,
              exerciseId,
              metric: candidate.metric,
            },
          },
          create: {
            userId,
            exerciseId,
            metric: candidate.metric,
            value: candidate.value,
            achievedAt: candidate.achievedAt,
            sessionId: ownerEntry?.sessionId ?? null,
            setId: candidate.setId,
          },
          update: {
            value: candidate.value,
            achievedAt: candidate.achievedAt,
            sessionId: ownerEntry?.sessionId ?? null,
            setId: candidate.setId,
          },
        });
        upsertCount++;
      }
    }

    res.json({ message: "PBs synced", upserted: upsertCount });
  } catch (error) {
    console.error("Sync PBs Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── 4. POST /api/pbs/check-session/:sessionId ───────────────────────────────
/** Check a single session against stored PBs and upsert any that were beaten.
 *  Call this right after saving a session. */
export const checkSessionPBs = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const sessionId = parseInt(req.params.sessionId as string, 10);
    if (isNaN(sessionId)) {
      res.status(400).json({ error: "Invalid sessionId" });
      return;
    }

    const session = await prisma.workoutSession.findFirst({
      where: { id: sessionId, userId },
      select: {
        startTime: true,
        exercises: {
          select: {
            exerciseId: true,
            sets: {
              select: {
                id: true,
                weight: true,
                reps: true,
                durationSec: true,
                distance: true,
              },
            },
          },
        },
      },
    });

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const newPBs: { exerciseId: string; metric: PBMetric; value: number }[] =
      [];

    for (const entry of session.exercises) {
      const sets = entry.sets.map((s) => ({
        ...s,
        achievedAt: session.startTime,
      }));

      const candidates = computePBsForSets(sets);

      for (const candidate of candidates) {
        const existing = await prisma.personalBest.findUnique({
          where: {
            userId_exerciseId_metric: {
              userId,
              exerciseId: entry.exerciseId,
              metric: candidate.metric,
            },
          },
        });

        if (!existing || candidate.value > existing.value) {
          await prisma.personalBest.upsert({
            where: {
              userId_exerciseId_metric: {
                userId,
                exerciseId: entry.exerciseId,
                metric: candidate.metric,
              },
            },
            create: {
              userId,
              exerciseId: entry.exerciseId,
              metric: candidate.metric,
              value: candidate.value,
              achievedAt: session.startTime,
              sessionId,
              setId: candidate.setId,
            },
            update: {
              value: candidate.value,
              achievedAt: session.startTime,
              sessionId,
              setId: candidate.setId,
            },
          });
          newPBs.push({
            exerciseId: entry.exerciseId,
            metric: candidate.metric,
            value: candidate.value,
          });
        }
      }
    }

    res.json({ newPBs, count: newPBs.length });
  } catch (error) {
    console.error("Check Session PBs Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── 5. DELETE /api/pbs/:exerciseId — delete ALL metrics for one exercise ─────
export const deleteAllPBsForExercise = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { exerciseId } = req.params as { exerciseId: string };

    const { count } = await prisma.personalBest.deleteMany({
      where: { userId, exerciseId },
    });

    res.json({ message: "Personal bests deleted", deleted: count });
  } catch (error) {
    console.error("Delete All PBs For Exercise Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ─── 6. DELETE /api/pbs/:exerciseId/:metric ───────────────────────────────────
export const deletePB = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { exerciseId, metric } = req.params as {
      exerciseId: string;
      metric: string;
    };

    const pb = await prisma.personalBest.findUnique({
      where: {
        userId_exerciseId_metric: {
          userId,
          exerciseId,
          metric: metric as PBMetric,
        },
      },
    });

    if (!pb) {
      res.status(404).json({ error: "Personal best not found" });
      return;
    }

    await prisma.personalBest.delete({
      where: {
        userId_exerciseId_metric: {
          userId,
          exerciseId,
          metric: metric as PBMetric,
        },
      },
    });

    res.json({ message: "Personal best deleted" });
  } catch (error) {
    console.error("Delete PB Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
