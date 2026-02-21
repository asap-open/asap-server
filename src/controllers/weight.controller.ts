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
    let dateFilter = {};
    let limit = 100;

    if (range === "1W") {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      dateFilter = { recordedAt: { gte: date } };
      limit = 1000;
    } else if (range === "1M") {
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      dateFilter = { recordedAt: { gte: date } };
      limit = 1000;
    } else if (range === "3M") {
      const date = new Date();
      date.setMonth(date.getMonth() - 3);
      dateFilter = { recordedAt: { gte: date } };
      limit = 1000;
    } else if (range === "6M") {
      const date = new Date();
      date.setMonth(date.getMonth() - 6);
      dateFilter = { recordedAt: { gte: date } };
      limit = 1000;
    } else if (range === "1Y") {
      const date = new Date();
      date.setFullYear(date.getFullYear() - 1);
      dateFilter = { recordedAt: { gte: date } };
      limit = 1000;
    } else if (range === "ALL") {
      limit = 5000;
    }

    const history = await prisma.weightLog.findMany({
      where: {
        userId,
        ...dateFilter,
      },
      orderBy: { recordedAt: "asc" }, // Graph usually wants ASC order
      take: limit,
    });

    res.status(200).json(history);
  } catch (error) {
    console.error("Get Weight History Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
