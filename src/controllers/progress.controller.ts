import { Response } from "express";
import { SessionLabel } from "../../prisma/generated/enums.js";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";

export type TimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
export const VALID_RANGES: TimeRange[] = ["1W", "1M", "3M", "6M", "1Y", "ALL"];
export const VALID_LABELS = new Set<string>(Object.values(SessionLabel));

export const parseRange = (raw: unknown): TimeRange => {
  const value = typeof raw === "string" ? raw.toUpperCase() : "1M";
  return VALID_RANGES.includes(value as TimeRange) ? (value as TimeRange) : "1M";
};

export const parseLabels = (raw: unknown): SessionLabel[] => {
  const rawLabels =
    typeof raw === "string"
      ? raw.split(",").map((l) => l.trim()).filter(Boolean)
      : [];
  return rawLabels.filter((l): l is SessionLabel => VALID_LABELS.has(l));
};

export const parseYear = (raw: unknown): number | undefined => {
  if (typeof raw !== "string" && typeof raw !== "number") return undefined;
  const parsed = typeof raw === "number" ? raw : parseInt(raw, 10);
  if (isNaN(parsed) || parsed < 1970 || parsed > 2100) return undefined;
  return parsed;
};

export const getRangeStartDate = (range: TimeRange): Date | null => {
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

export const toDayKey = (date: Date): string => date.toISOString().split("T")[0] ?? "";

export const startOfUTCDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const endOfUTCDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

export const addDaysUTC = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

export const diffDays = (start: Date, end: Date): number => {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

export const computeCurrentStreak = (activeDayKeys: Set<string>): number => {
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

export interface HeatmapDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ProgressMetricsResult {
  consistency: number;
  activeDays: number;
  currentStreak: number;
  totalVolume: number;
}

export interface ProgressChartPoint {
  date: string;
  value: number;
  sessions?: number;
}

// ---------------------------------------------------------------------------
// Business Logic & Calculation Helpers
// ---------------------------------------------------------------------------

export const calculateHeatmapData = async (
  userId: string,
  year?: number,
): Promise<{
  year?: number;
  startDate: string;
  endDate: string;
  totalWorkouts: number;
  currentStreak: number;
  heatmap: HeatmapDay[];
}> => {
  let startDate: Date;
  let endDate: Date;

  if (year) {
    startDate = new Date(Date.UTC(year, 0, 1));
    endDate = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  } else {
    const today = startOfUTCDay(new Date());
    endDate = endOfUTCDay(today);
    startDate = addDaysUTC(today, -364);
  }

  const sessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: { startTime: true },
    orderBy: { startTime: "asc" },
  });

  const heatmapCounts = new Map<string, number>();
  for (const s of sessions) {
    const key = toDayKey(s.startTime);
    heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
  }

  // Calculate streak from active days around current time (past 365 days)
  const oneYearAgo = addDaysUTC(startOfUTCDay(new Date()), -365);
  const recentSessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      startTime: { gte: oneYearAgo },
    },
    select: { startTime: true },
  });
  const allActiveDays = new Set<string>(recentSessions.map((s) => toDayKey(s.startTime)));
  const currentStreak = computeCurrentStreak(allActiveDays);

  const heatmap: HeatmapDay[] = [];
  const startDay = startOfUTCDay(startDate);
  const endDay = startOfUTCDay(endDate);

  for (let cursor = startDay; cursor <= endDay; cursor = addDaysUTC(cursor, 1)) {
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

  return {
    year,
    startDate: toDayKey(startDate),
    endDate: toDayKey(endDate),
    totalWorkouts: sessions.length,
    currentStreak,
    heatmap,
  };
};

export const calculateProgressMetrics = async (
  userId: string,
  range: TimeRange,
  selectedLabels: SessionLabel[] = [],
): Promise<ProgressMetricsResult> => {
  const rangeStart = getRangeStartDate(range);
  const dateFilter = rangeStart ? { startTime: { gte: rangeStart } } : {};

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

  let totalVolume = 0;
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
  }

  const oneYearAgo = addDaysUTC(startOfUTCDay(new Date()), -365);
  const recentSessions = await prisma.workoutSession.findMany({
    where: {
      userId,
      startTime: { gte: oneYearAgo },
    },
    select: { startTime: true },
  });
  const allActiveDays = new Set<string>(recentSessions.map((s) => toDayKey(s.startTime)));
  const currentStreak = computeCurrentStreak(allActiveDays);

  const activeDaysCount = rangeActiveDays.size;
  const nowUtc = startOfUTCDay(new Date());
  const effectiveStart = rangeStart
    ? startOfUTCDay(rangeStart)
    : (sessions.length > 0 ? startOfUTCDay(sessions[0]!.startTime) : addDaysUTC(nowUtc, -30));
  const totalDaysInRange = diffDays(effectiveStart, nowUtc) + 1;
  const consistency = Math.min(100, Math.round((activeDaysCount / Math.max(1, totalDaysInRange)) * 100));

  return {
    consistency,
    activeDays: activeDaysCount,
    currentStreak,
    totalVolume: Math.round(totalVolume),
  };
};

export const calculateVolumeTracking = async (
  userId: string,
  range: TimeRange,
  metric: "volume" | "weight" = "volume",
  selectedLabels: SessionLabel[] = [],
): Promise<{
  chartData: ProgressChartPoint[];
  metric: "volume" | "weight";
  range: TimeRange;
  selectedLabels: SessionLabel[];
  totalVolume?: number;
}> => {
  const rangeStart = getRangeStartDate(range);

  if (metric === "volume") {
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...(rangeStart ? { startTime: { gte: rangeStart } } : {}),
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

    let totalVolume = 0;
    const dailyVolumeMap = new Map<string, { volume: number; sessions: number }>();

    for (const session of sessions) {
      const dayKey = toDayKey(session.startTime);
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

    const chartData = [...dailyVolumeMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, data]) => ({
        date,
        value: Math.round(data.volume),
        sessions: data.sessions,
      }));

    return {
      chartData,
      metric,
      range,
      selectedLabels,
      totalVolume: Math.round(totalVolume),
    };
  } else {
    const weightLogs = await prisma.weightLog.findMany({
      where: {
        userId,
        ...(rangeStart ? { recordedAt: { gte: rangeStart } } : {}),
      },
      orderBy: { recordedAt: "asc" },
    });

    const chartData = weightLogs.map((log) => ({
      date: toDayKey(log.recordedAt),
      value: log.weightKg,
    }));

    return {
      chartData,
      metric,
      range,
      selectedLabels,
    };
  }
};

// ---------------------------------------------------------------------------
// Specific Route Handlers
// ---------------------------------------------------------------------------

/**
 * GET /api/progress/heatmap
 * Fetches activity heatmap data for a specific year (or trailing 365 days by default).
 * Query Params:
 *  - year (optional): number (e.g. 2026)
 */
export const getProgressHeatmap = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const year = parseYear(req.query.year);
    const result = await calculateHeatmapData(userId, year);
    res.json(result);
  } catch (error) {
    console.error("Get Progress Heatmap Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/progress/metrics
 * Calculates KPI metrics (consistency, active days, current streak, total volume).
 * Query Params:
 *  - range (optional): "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL"
 *  - labels (optional): comma-separated SessionLabel
 */
export const getProgressMetrics = async (
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
    const selectedLabels = parseLabels(req.query.labels);
    const metrics = await calculateProgressMetrics(userId, range, selectedLabels);
    res.json({
      metrics,
      range,
      selectedLabels,
    });
  } catch (error) {
    console.error("Get Progress Metrics Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/progress/volume
 * Returns volume or body weight time-series chart data.
 * Query Params:
 *  - range (optional): "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL"
 *  - metric (optional): "volume" | "weight"
 *  - labels (optional): comma-separated SessionLabel
 */
export const getVolumeTracking = async (
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
    const selectedLabels = parseLabels(req.query.labels);

    const result = await calculateVolumeTracking(userId, range, metric, selectedLabels);
    res.json(result);
  } catch (error) {
    console.error("Get Volume Tracking Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
