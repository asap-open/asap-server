import { Response } from "express";
import { SessionLabel } from "../../prisma/generated/enums.js";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

type TimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
const VALID_RANGES: TimeRange[] = ["1W", "1M", "3M", "6M", "1Y", "ALL"];
const VALID_LABELS = new Set<string>(Object.values(SessionLabel));

const parseRange = (raw: unknown): TimeRange => {
  const value = typeof raw === "string" ? raw.toUpperCase() : "1M";
  return VALID_RANGES.includes(value as TimeRange) ? (value as TimeRange) : "1M";
};

const getRangeStartDate = (range: TimeRange): Date | null => {
  const now = new Date();
  const date = new Date(now);
  if (range === "1W") {
    date.setUTCDate(date.getUTCDate() - 7);
    return date;
  }
  if (range === "1M") {
    date.setUTCMonth(date.getUTCMonth() - 1);
    return date;
  }
  if (range === "3M") {
    date.setUTCMonth(date.getUTCMonth() - 3);
    return date;
  }
  if (range === "6M") {
    date.setUTCMonth(date.getUTCMonth() - 6);
    return date;
  }
  if (range === "1Y") {
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    return date;
  }
  return null;
};

const toDayKey = (date: Date): string => date.toISOString().split("T")[0] ?? "";

const startOfUTCDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addDaysUTC = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const diffDays = (start: Date, end: Date): number => {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

const computeCurrentStreak = (activeDayKeys: Set<string>): number => {
  if (activeDayKeys.size === 0) return 0;
  const today = startOfUTCDay(new Date());
  let cursor = today;

  // If no workout today, check if streak is alive from yesterday
  if (!activeDayKeys.has(toDayKey(cursor))) {
    cursor = addDaysUTC(cursor, -1);
    if (!activeDayKeys.has(toDayKey(cursor))) {
      return 0;
    }
  }

  let streak = 0;
  while (activeDayKeys.has(toDayKey(cursor))) {
    streak += 1;
    cursor = addDaysUTC(cursor, -1);
  }
  return streak;
};

export const getProgressOverview = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const range = parseRange(req.query.range);
    const metric = req.query.metric === "weight" ? "weight" : "volume";
    const rawLabels = typeof req.query.labels === "string" ? req.query.labels.split(",").map((l) => l.trim()).filter(Boolean) : [];
    const selectedLabels = rawLabels.filter((l): l is SessionLabel => VALID_LABELS.has(l));

    const rangeStart = getRangeStartDate(range);
    const dateFilter = rangeStart ? { startTime: { gte: rangeStart } } : {};

    // 1. Fetch sessions for the selected range (and label filter if applicable for volume)
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...dateFilter,
        ...(selectedLabels.length > 0
          ? {
              labels: {
                hasSome: selectedLabels,
              },
            }
          : {}),
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

    // 2. Compute Volume and Active Days for the Range
    let totalVolume = 0;
    const dailyVolumeMap = new Map<string, { volume: number; sessions: number }>();
    const rangeActiveDays = new Set<string>();

    for (const session of sessions) {
      const dayKey = toDayKey(session.startTime);
      rangeActiveDays.add(dayKey);

      let sessionVolume = 0;
      for (const ex of session.exercises) {
        if (ex.isTimeBased) continue;
        for (const set of ex.sets) {
          sessionVolume += (set.weight || 0) * (set.reps || 0);
        }
      }

      totalVolume += sessionVolume;

      const current = dailyVolumeMap.get(dayKey) ?? { volume: 0, sessions: 0 };
      current.volume += sessionVolume;
      current.sessions += 1;
      dailyVolumeMap.set(dayKey, current);
    }

    // 3. Compute Streak (across all sessions in the past year)
    const oneYearAgo = addDaysUTC(startOfUTCDay(new Date()), -365);
    const recentSessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        startTime: { gte: oneYearAgo },
      },
      select: { startTime: true },
      orderBy: { startTime: "asc" },
    });

    const allActiveDays = new Set<string>();
    const heatmapCounts = new Map<string, number>();

    for (const s of recentSessions) {
      const key = toDayKey(s.startTime);
      allActiveDays.add(key);
      heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
    }

    const currentStreak = computeCurrentStreak(allActiveDays);

    // 4. Generate GitHub Heatmap data (full past 365 days up to today)
    const today = startOfUTCDay(new Date());
    const heatmapStart = addDaysUTC(today, -364);
    const heatmap: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }> = [];

    for (let cursor = heatmapStart; cursor <= today; cursor = addDaysUTC(cursor, 1)) {
      const key = toDayKey(cursor);
      const count = heatmapCounts.get(key) ?? 0;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (count === 1) level = 1;
      else if (count === 2) level = 2;
      else if (count === 3) level = 3;
      else if (count >= 4) level = 4;

      heatmap.push({
        date: key,
        count,
        level,
      });
    }

    // 5. Compute Consistency percentage for selected range
    const activeDaysCount = rangeActiveDays.size;
    const nowUtc = startOfUTCDay(new Date());
    const effectiveStart = rangeStart
      ? startOfUTCDay(rangeStart)
      : (sessions.length > 0 ? startOfUTCDay(sessions[0]!.startTime) : addDaysUTC(nowUtc, -30));
    const totalDaysInRange = diffDays(effectiveStart, nowUtc) + 1;
    const consistency = Math.min(100, Math.round((activeDaysCount / Math.max(1, totalDaysInRange)) * 100));

    // 6. Chart Data
    let chartData: Array<{ date: string; value: number; sessions?: number }> = [];

    if (metric === "volume") {
      chartData = [...dailyVolumeMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, data]) => ({
          date,
          value: Math.round(data.volume),
          sessions: data.sessions,
        }));
    } else {
      // Body Weight Logs
      const weightLogs = await prisma.weightLog.findMany({
        where: {
          userId,
          ...(rangeStart ? { recordedAt: { gte: rangeStart } } : {}),
        },
        orderBy: { recordedAt: "asc" },
      });

      chartData = weightLogs.map((log) => ({
        date: toDayKey(log.recordedAt),
        value: log.weightKg,
      }));
    }

    res.json({
      metrics: {
        consistency,
        activeDays: activeDaysCount,
        currentStreak,
        totalVolume: Math.round(totalVolume),
      },
      heatmap,
      chartData,
      metric,
      range,
      selectedLabels,
    });
  } catch (error) {
    console.error("Get Progress Overview Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
