import { Response } from "express";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

// 1. Log Weight
export const logWeight = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { weightKg, recordedAt } = req.body;

    if (!weightKg) {
      res.status(400).json({ error: "Weight is required" });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      const log = await tx.weightLog.create({
        data: {
          userId,
          weightKg: parseFloat(weightKg),
          recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        },
      });

      await tx.userProfile.update({
        where: { userId },
        data: {
          latestWeightKg: parseFloat(weightKg),
        },
      });
      return log;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error("Log Weight Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 2. Get Weight History
export const getWeightHistory = async (
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
    let startDate: Date | null = null;
    const now = new Date();

    if (range === "1W") {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === "1M") {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (range === "3M") {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 3);
    } else if (range === "6M") {
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 6);
    } else if (range === "1Y") {
      startDate = new Date(now);
      startDate.setFullYear(startDate.getFullYear() - 1);
    }

    // If "ALL" or no specific range, find the first weight log date
    if (!startDate && range === "ALL") {
      const firstLog = await prisma.weightLog.findFirst({
        where: { userId },
        orderBy: { recordedAt: "asc" },
      });
      if (firstLog) {
        startDate = new Date(firstLog.recordedAt);
      } else {
        // Fallback to 30 days if no logs
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 30);
      }
    } else if (!startDate) {
      // Default to 1M if range is unrecognized and not ALL
      startDate = new Date(now);
      startDate.setMonth(startDate.getMonth() - 1);
    }

    const dateFilter = { recordedAt: { gte: startDate } };

    const history = await prisma.weightLog.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      orderBy: { recordedAt: "asc" },
    });

    // Bucket by day (using local date string or UTC?)
    // Aligning with standard DB ISO format (YYYY-MM-DD)
    const dailyWeights = new Map<string, number>();
    for (const log of history) {
      const dayKey = log.recordedAt.toISOString().split("T")[0]!;
      // Takes the latest weight if multiple exist (since ordered ASC)
      dailyWeights.set(dayKey, log.weightKg);
    }

    const sequence: Array<{ date: string; weight: number | null }> = [];
    const startUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    const endUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    // Look up the last weight recorded *before* the range start so we can
    // carry it forward into the sequence for days that have no explicit entry.
    const latestBeforeRange = await prisma.weightLog.findFirst({
      where: {
        userId,
        recordedAt: { lt: startDate },
      },
      orderBy: { recordedAt: "desc" },
    });

    let lastKnownWeight: number | null = latestBeforeRange?.weightKg ?? null;

    let current = new Date(startUTC);
    // Add an upper bound of 5000 days just in case to prevent infinite loops
    let safeguard = 0;
    while (current <= endUTC && safeguard < 5000) {
      const key = current.toISOString().split("T")[0]!;
      const logged = dailyWeights.get(key) ?? null;
      if (logged !== null) lastKnownWeight = logged;
      sequence.push({
        date: key,
        // Use the carry-forward weight; null only if never recorded at all
        weight: logged ?? lastKnownWeight,
      });
      current.setUTCDate(current.getUTCDate() + 1);
      safeguard++;
    }

    res.status(200).json(sequence);
  } catch (error) {
    console.error("Get Weight History Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
