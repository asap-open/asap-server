import { Response } from "express";
import { PBMetric } from "../../prisma/generated/enums.js";
import { prisma } from "../utils/prisma.js";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { computeWorkoutMetrics } from "../utils/workoutMetrics.js";

type TimeRange = "1W" | "1M" | "3M" | "6M" | "1Y" | "ALL";
type ProgressMode = "Strength" | "Body" | "Balanced";
type CalendarMetric = "sessions" | "volume" | "intensity";
type Granularity = "day" | "week" | "month";

const VALID_RANGES: TimeRange[] = ["1W", "1M", "3M", "6M", "1Y", "ALL"];
const VALID_MODES: ProgressMode[] = ["Strength", "Body", "Balanced"];
const VALID_CALENDAR_METRICS: CalendarMetric[] = [
  "sessions",
  "volume",
  "intensity",
];
const VALID_GRANULARITIES: Granularity[] = ["day", "week", "month"];

const parseRange = (raw: unknown): TimeRange => {
  const value = typeof raw === "string" ? raw.toUpperCase() : "1M";
  return VALID_RANGES.includes(value as TimeRange)
    ? (value as TimeRange)
    : "1M";
};

const parseMode = (raw: unknown): ProgressMode => {
  const value = typeof raw === "string" ? raw.toLowerCase() : "balanced";
  if (value === "strength") return "Strength";
  if (value === "body") return "Body";
  return "Balanced";
};

const parseCalendarMetric = (raw: unknown): CalendarMetric => {
  const value = typeof raw === "string" ? raw.toLowerCase() : "sessions";
  return VALID_CALENDAR_METRICS.includes(value as CalendarMetric)
    ? (value as CalendarMetric)
    : "sessions";
};

const parseGranularity = (raw: unknown): Granularity => {
  const value = typeof raw === "string" ? raw.toLowerCase() : "day";
  return VALID_GRANULARITIES.includes(value as Granularity)
    ? (value as Granularity)
    : "day";
};

const toDayKey = (date: Date): string => date.toISOString().split("T")[0] ?? "";

const epley1RM = (weight: number, reps: number): number =>
  reps === 1 ? weight : weight * (1 + reps / 30);

const startOfUTCDay = (date: Date): Date =>
  new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );

const addDaysUTC = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
};

const diffDays = (start: Date, end: Date): number => {
  const ms = end.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
};

const getRangeStart = (range: TimeRange): Date | null => {
  const date = new Date();

  if (range === "1W") {
    date.setDate(date.getDate() - 7);
    return date;
  }

  if (range === "1M") {
    date.setMonth(date.getMonth() - 1);
    return date;
  }

  if (range === "3M") {
    date.setMonth(date.getMonth() - 3);
    return date;
  }

  if (range === "6M") {
    date.setMonth(date.getMonth() - 6);
    return date;
  }

  if (range === "1Y") {
    date.setFullYear(date.getFullYear() - 1);
    return date;
  }

  return null;
};

const getSessionDateFilter = (range: TimeRange) => {
  const start = getRangeStart(range);
  if (!start) {
    return {};
  }

  return { startTime: { gte: start } };
};

const getWeightDateFilter = (range: TimeRange) => {
  const start = getRangeStart(range);
  if (!start) {
    return {};
  }

  return { recordedAt: { gte: start } };
};

const getUserIdOrReject = (req: AuthRequest, res: Response): string | null => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  return userId;
};

type DailyAggregate = {
  day: string;
  sessions: number;
  volume: number;
  bodyweightScore: number;
  durationMin: number;
};

const buildDailyAggregation = (
  sessions: Array<{
    startTime: Date;
    endTime: Date | null;
    exercises: Array<{
      isTimeBased: boolean;
      sets: Array<{ weight: number; reps: number }>;
      exercise: {
        isBodyweightExercise: boolean;
        equipment: string;
      };
    }>;
  }>,
): Map<string, DailyAggregate> => {
  const map = new Map<string, DailyAggregate>();

  for (const session of sessions) {
    const day = toDayKey(session.startTime);
    const existing = map.get(day) ?? {
      day,
      sessions: 0,
      volume: 0,
      bodyweightScore: 0,
      durationMin: 0,
    };

    const metrics = computeWorkoutMetrics(session.exercises);
    const durationMin = session.endTime
      ? (session.endTime.getTime() - session.startTime.getTime()) / 60000
      : 0;

    existing.sessions += 1;
    existing.volume += metrics.totalVolume;
    existing.bodyweightScore += metrics.bodyweightScore;
    existing.durationMin += Math.max(0, durationMin);

    map.set(day, existing);
  }

  return map;
};

const computeStreaks = (activeDayKeys: string[]) => {
  if (activeDayKeys.length === 0) {
    return { current: 0, best: 0 };
  }

  const sorted = [...activeDayKeys].sort();
  let best = 1;
  let streak = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = startOfUTCDay(new Date(sorted[i - 1] ?? ""));
    const curr = startOfUTCDay(new Date(sorted[i] ?? ""));
    const delta = diffDays(prev, curr);

    if (delta === 1) {
      streak += 1;
    } else {
      best = Math.max(best, streak);
      streak = 1;
    }
  }

  best = Math.max(best, streak);

  const today = startOfUTCDay(new Date());
  const activeSet = new Set(sorted);
  let current = 0;
  let cursor = today;

  while (activeSet.has(toDayKey(cursor))) {
    current += 1;
    cursor = addDaysUTC(cursor, -1);
  }

  return { current, best };
};

const calculateWeeklyTarget = (mode: ProgressMode): number => {
  if (mode === "Strength") return 5;
  if (mode === "Body") return 4;
  return 4;
};

const percentChange = (current: number, previous: number): number | null => {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const buildBucketKey = (date: Date, granularity: Granularity): string => {
  if (granularity === "month") {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1),
    );
    return toDayKey(start);
  }

  if (granularity === "week") {
    const d = startOfUTCDay(date);
    const weekday = d.getUTCDay();
    const diffToMonday = weekday === 0 ? 6 : weekday - 1;
    const monday = addDaysUTC(d, -diffToMonday);
    return toDayKey(monday);
  }

  return toDayKey(date);
};

const bucketizeDaily = (
  daily: Map<string, DailyAggregate>,
  granularity: Granularity,
) => {
  const buckets = new Map<
    string,
    {
      bucket: string;
      sessions: number;
      volume: number;
      bodyweightScore: number;
      durationMin: number;
    }
  >();

  for (const aggregate of daily.values()) {
    const bucket = buildBucketKey(new Date(aggregate.day), granularity);
    const existing = buckets.get(bucket) ?? {
      bucket,
      sessions: 0,
      volume: 0,
      bodyweightScore: 0,
      durationMin: 0,
    };

    existing.sessions += aggregate.sessions;
    existing.volume += aggregate.volume;
    existing.bodyweightScore += aggregate.bodyweightScore;
    existing.durationMin += aggregate.durationMin;
    buckets.set(bucket, existing);
  }

  return [...buckets.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
};

const buildModeTargets = (mode: ProgressMode) => {
  if (mode === "Strength") {
    return { push: 30, pull: 30, legs: 30, core: 10 };
  }

  if (mode === "Body") {
    return { push: 35, pull: 25, legs: 25, core: 15 };
  }

  return { push: 30, pull: 30, legs: 30, core: 10 };
};

const mapMuscleGroup = (
  muscle: string,
): "push" | "pull" | "legs" | "core" | "other" => {
  const value = muscle.toLowerCase();

  if (
    ["chest", "shoulders", "triceps", "front delts"].some((v) =>
      value.includes(v),
    )
  ) {
    return "push";
  }

  if (
    ["back", "lats", "biceps", "traps", "rear delts", "rhomboids"].some((v) =>
      value.includes(v),
    )
  ) {
    return "pull";
  }

  if (
    [
      "quads",
      "hamstrings",
      "glutes",
      "calves",
      "adductors",
      "abductors",
      "legs",
    ].some((v) => value.includes(v))
  ) {
    return "legs";
  }

  if (
    ["core", "abs", "obliques", "erectors", "lower back"].some((v) =>
      value.includes(v),
    )
  ) {
    return "core";
  }

  return "other";
};

const asBoolean = (raw: unknown): boolean => {
  if (typeof raw !== "string") return false;
  return raw === "1" || raw.toLowerCase() === "true";
};

const getISODateError = (dateStr: string): Date | null => {
  const parsed = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

// Helper kept for legacy endpoints.
const getDateFilter = (range: string) => {
  const parsedRange = parseRange(range);
  return getSessionDateFilter(parsedRange);
};

export const getProgressSummary = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const mode = parseMode(req.query.mode);
    const dateFilter = getSessionDateFilter(range);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, ...dateFilter },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    const daily = buildDailyAggregation(sessions);
    const dailyValues = [...daily.values()];

    const totals = dailyValues.reduce(
      (acc, curr) => {
        acc.sessions += curr.sessions;
        acc.volume += curr.volume;
        acc.bodyweightScore += curr.bodyweightScore;
        acc.durationMin += curr.durationMin;
        return acc;
      },
      { sessions: 0, volume: 0, bodyweightScore: 0, durationMin: 0 },
    );

    const streaks = computeStreaks(dailyValues.map((d) => d.day));

    const targetSessionsPerWeek = calculateWeeklyTarget(mode);
    const startForRange = getRangeStart(range);
    const startDate =
      startForRange ??
      (sessions.length > 0
        ? (sessions[0]?.startTime ?? new Date())
        : addDaysUTC(new Date(), -30));
    const rangeDays = diffDays(startDate, new Date());
    const adherenceTarget = (rangeDays / 7) * targetSessionsPerWeek;
    const adherencePct =
      adherenceTarget > 0
        ? clamp((totals.sessions / adherenceTarget) * 100, 0, 100)
        : 0;

    let trends: {
      sessionsPct: number | null;
      volumePct: number | null;
      bodyweightScorePct: number | null;
    } = {
      sessionsPct: null,
      volumePct: null,
      bodyweightScorePct: null,
    };

    if (startForRange) {
      const windowDays = diffDays(startForRange, new Date());
      const prevStart = addDaysUTC(startForRange, -windowDays);

      const prevSessions = await prisma.workoutSession.findMany({
        where: {
          userId,
          startTime: {
            gte: prevStart,
            lt: startForRange,
          },
        },
        include: {
          exercises: {
            include: {
              sets: true,
              exercise: {
                select: {
                  isBodyweightExercise: true,
                  equipment: true,
                },
              },
            },
          },
        },
      });

      const prevDaily = buildDailyAggregation(prevSessions);
      const prevTotals = [...prevDaily.values()].reduce(
        (acc, curr) => {
          acc.sessions += curr.sessions;
          acc.volume += curr.volume;
          acc.bodyweightScore += curr.bodyweightScore;
          return acc;
        },
        { sessions: 0, volume: 0, bodyweightScore: 0 },
      );

      trends = {
        sessionsPct: percentChange(totals.sessions, prevTotals.sessions),
        volumePct: percentChange(totals.volume, prevTotals.volume),
        bodyweightScorePct: percentChange(
          totals.bodyweightScore,
          prevTotals.bodyweightScore,
        ),
      };
    }

    const avgSessionDurationMin =
      totals.sessions > 0 ? totals.durationMin / totals.sessions : 0;

    res.json({
      range,
      mode,
      totals: {
        sessions: totals.sessions,
        activeDays: daily.size,
        totalVolume: totals.volume,
        bodyweightScore: totals.bodyweightScore,
        avgSessionDurationMin,
      },
      streaks,
      adherence: {
        targetSessionsPerWeek,
        percentage: adherencePct,
      },
      trends,
    });
  } catch (error) {
    console.error("Get Progress Summary Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressCalendar = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const metric = parseCalendarMetric(req.query.metric);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, ...getSessionDateFilter(range) },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    const dailyMap = buildDailyAggregation(sessions);
    const now = startOfUTCDay(new Date());
    const startFromRange = getRangeStart(range);
    let start =
      startFromRange != null
        ? startOfUTCDay(startFromRange)
        : sessions.length > 0
          ? startOfUTCDay(sessions[0]?.startTime ?? now)
          : addDaysUTC(now, -89);

    // Guard very large fills for ALL ranges.
    if (diffDays(start, now) > 400) {
      start = addDaysUTC(now, -399);
    }

    const days: Array<{
      day: string;
      sessions: number;
      volume: number;
      bodyweightScore: number;
      intensity: number;
      level: 0 | 1 | 2 | 3 | 4;
    }> = [];

    const selectedMetricValues: number[] = [];

    for (let cursor = start; cursor <= now; cursor = addDaysUTC(cursor, 1)) {
      const key = toDayKey(cursor);
      const aggregate = dailyMap.get(key) ?? {
        day: key,
        sessions: 0,
        volume: 0,
        bodyweightScore: 0,
        durationMin: 0,
      };

      const intensity =
        aggregate.sessions * 0.2 +
        aggregate.volume * 0.00005 +
        aggregate.bodyweightScore * 0.01;

      selectedMetricValues.push(
        metric === "sessions"
          ? aggregate.sessions
          : metric === "volume"
            ? aggregate.volume
            : intensity,
      );

      days.push({
        day: key,
        sessions: aggregate.sessions,
        volume: aggregate.volume,
        bodyweightScore: aggregate.bodyweightScore,
        intensity,
        level: 0,
      });
    }

    const maxValue = Math.max(...selectedMetricValues, 0);

    for (const day of days) {
      const value =
        metric === "sessions"
          ? day.sessions
          : metric === "volume"
            ? day.volume
            : day.intensity;

      if (value <= 0 || maxValue <= 0) {
        day.level = 0;
      } else {
        const ratio = value / maxValue;
        if (ratio < 0.25) day.level = 1;
        else if (ratio < 0.5) day.level = 2;
        else if (ratio < 0.75) day.level = 3;
        else day.level = 4;
      }
    }

    const streaks = computeStreaks(
      days.filter((d) => d.sessions > 0).map((d) => d.day),
    );

    res.json({
      range,
      metric,
      startDate: toDayKey(start),
      endDate: toDayKey(now),
      days,
      summary: {
        activeDays: days.filter((d) => d.sessions > 0).length,
        totalDays: days.length,
        currentStreak: streaks.current,
        bestStreak: streaks.best,
      },
    });
  } catch (error) {
    console.error("Get Progress Calendar Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressTimeSeries = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const granularity = parseGranularity(req.query.granularity);
    const compare = asBoolean(req.query.compare);
    const start = getRangeStart(range);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, ...getSessionDateFilter(range) },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    const currentDaily = buildDailyAggregation(sessions);
    const currentBuckets = bucketizeDaily(currentDaily, granularity);

    let previousBuckets: typeof currentBuckets = [];
    if (compare && start) {
      const windowDays = diffDays(start, new Date());
      const prevStart = addDaysUTC(start, -windowDays);

      const prevSessions = await prisma.workoutSession.findMany({
        where: {
          userId,
          startTime: {
            gte: prevStart,
            lt: start,
          },
        },
        include: {
          exercises: {
            include: {
              sets: true,
              exercise: {
                select: {
                  isBodyweightExercise: true,
                  equipment: true,
                },
              },
            },
          },
        },
      });

      previousBuckets = bucketizeDaily(
        buildDailyAggregation(prevSessions),
        granularity,
      );
    }

    res.json({
      range,
      granularity,
      compare,
      current: currentBuckets,
      previous: previousBuckets,
    });
  } catch (error) {
    console.error("Get Progress Time Series Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressMuscleBalance = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const mode = parseMode(req.query.mode);
    const targets = buildModeTargets(mode);

    const sessions = await prisma.workoutSession.findMany({
      where: { userId, ...getSessionDateFilter(range) },
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
    const groupCounts: Record<
      "push" | "pull" | "legs" | "core" | "other",
      number
    > = {
      push: 0,
      pull: 0,
      legs: 0,
      core: 0,
      other: 0,
    };

    for (const session of sessions) {
      for (const entry of session.exercises) {
        const setCount = entry.sets.length;
        const muscles = entry.exercise.primaryMuscles as string[];

        if (!Array.isArray(muscles) || muscles.length === 0) {
          groupCounts.other += setCount;
          continue;
        }

        for (const muscle of muscles) {
          muscleCounts[muscle] = (muscleCounts[muscle] ?? 0) + setCount;
          const group = mapMuscleGroup(muscle);
          groupCounts[group] += setCount;
        }
      }
    }

    const totalSets = Object.values(muscleCounts).reduce(
      (acc, curr) => acc + curr,
      0,
    );

    const muscles = Object.entries(muscleCounts)
      .map(([muscle, sets]) => ({
        muscle,
        sets,
        ratio: totalSets > 0 ? (sets / totalSets) * 100 : 0,
      }))
      .sort((a, b) => b.sets - a.sets);

    const groups = (
      Object.keys(groupCounts) as Array<keyof typeof groupCounts>
    ).map((group) => {
      const sets = groupCounts[group];
      const ratio = totalSets > 0 ? (sets / totalSets) * 100 : 0;
      const target = group === "other" ? 0 : targets[group];
      const delta = ratio - target;

      let status: "low" | "balanced" | "high" = "balanced";
      if (group !== "other") {
        if (delta <= -8) status = "low";
        else if (delta >= 8) status = "high";
      }

      return {
        group,
        sets,
        ratio,
        target,
        status,
      };
    });

    res.json({
      range,
      mode,
      totalSets,
      muscles,
      groups,
    });
  } catch (error) {
    console.error("Get Progress Muscle Balance Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressPBTimeline = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const exerciseId =
      typeof req.query.exerciseId === "string" &&
      req.query.exerciseId.length > 0
        ? req.query.exerciseId
        : undefined;

    let metric: PBMetric | undefined;
    if (typeof req.query.metric === "string" && req.query.metric.length > 0) {
      if (!Object.values(PBMetric).includes(req.query.metric as PBMetric)) {
        res.status(400).json({ error: "Invalid PB metric" });
        return;
      }
      metric = req.query.metric as PBMetric;
    }

    const start = getRangeStart(range);

    const events = await prisma.personalBest.findMany({
      where: {
        userId,
        ...(exerciseId ? { exerciseId } : {}),
        ...(metric ? { metric } : {}),
        ...(start ? { achievedAt: { gte: start } } : {}),
      },
      include: {
        exercise: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
        session: {
          select: {
            id: true,
            sessionName: true,
            startTime: true,
          },
        },
      },
      orderBy: { achievedAt: "asc" },
    });

    let avgDaysBetweenPr: number | null = null;
    if (events.length > 1) {
      let totalGapDays = 0;
      for (let i = 1; i < events.length; i++) {
        const prev = events[i - 1]?.achievedAt ?? events[0].achievedAt;
        const curr =
          events[i]?.achievedAt ?? events[events.length - 1].achievedAt;
        totalGapDays += diffDays(prev, curr);
      }
      avgDaysBetweenPr = totalGapDays / (events.length - 1);
    }

    res.json({
      range,
      metric: metric ?? null,
      exerciseId: exerciseId ?? null,
      events,
      summary: {
        count: events.length,
        avgDaysBetweenPr,
      },
    });
  } catch (error) {
    console.error("Get Progress PB Timeline Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressStrength1RM = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const exerciseId =
      typeof req.query.exerciseId === "string" &&
      req.query.exerciseId.length > 0
        ? req.query.exerciseId
        : "";

    if (!exerciseId) {
      res.status(400).json({ error: "exerciseId is required" });
      return;
    }

    const entries = await prisma.exerciseEntry.findMany({
      where: {
        exerciseId,
        session: {
          userId,
          ...getSessionDateFilter(range),
        },
      },
      include: {
        sets: {
          select: {
            weight: true,
            reps: true,
          },
        },
        session: {
          select: {
            startTime: true,
          },
        },
        exercise: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        session: {
          startTime: "asc",
        },
      },
    });

    const dayBest = new Map<
      string,
      { day: string; e1rm: number; sourceWeight: number; sourceReps: number }
    >();

    for (const entry of entries) {
      const day = toDayKey(entry.session.startTime);

      for (const set of entry.sets) {
        if (set.weight <= 0 || set.reps <= 0) continue;
        const estimate = epley1RM(set.weight, set.reps);
        const existing = dayBest.get(day);
        if (!existing || estimate > existing.e1rm) {
          dayBest.set(day, {
            day,
            e1rm: estimate,
            sourceWeight: set.weight,
            sourceReps: set.reps,
          });
        }
      }
    }

    const series = [...dayBest.values()].sort((a, b) =>
      a.day.localeCompare(b.day),
    );
    const latest = series[series.length - 1] ?? null;
    const best =
      series.length > 0 ? [...series].sort((a, b) => b.e1rm - a.e1rm)[0] : null;

    const first = series[0];
    const changePct =
      first && latest && first.e1rm > 0
        ? ((latest.e1rm - first.e1rm) / first.e1rm) * 100
        : null;

    res.json({
      range,
      exerciseId,
      exerciseName: entries[0]?.exercise.name ?? null,
      series,
      summary: {
        latest,
        best,
        changePct,
      },
    });
  } catch (error) {
    console.error("Get Progress Strength 1RM Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressWorkload = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const range = parseRange(req.query.range);
    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        ...getSessionDateFilter(range),
      },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
        },
      },
    });

    const daily = buildDailyAggregation(sessions);
    const orderedDays = [...daily.values()].sort((a, b) =>
      a.day.localeCompare(b.day),
    );

    const workloads = orderedDays.map((d) => ({
      day: d.day,
      workload: d.volume,
      sessions: d.sessions,
    }));

    const last = workloads.slice(-35);
    const acuteWindow = last.slice(-7);
    const previousWeek = last.slice(-14, -7);
    const chronicWindow = last.slice(-35, -7);

    const acute = acuteWindow.reduce((acc, curr) => acc + curr.workload, 0);
    const previous7 = previousWeek.reduce(
      (acc, curr) => acc + curr.workload,
      0,
    );
    const chronicTotal = chronicWindow.reduce(
      (acc, curr) => acc + curr.workload,
      0,
    );
    const chronicWeeklyAvg = chronicWindow.length > 0 ? chronicTotal / 4 : 0;

    const acwr = chronicWeeklyAvg > 0 ? acute / chronicWeeklyAvg : null;
    const rampRate = acute - previous7;

    let status: "under" | "optimal" | "high" | "danger" | "insufficient" =
      "insufficient";
    if (acwr !== null) {
      if (acwr < 0.8) status = "under";
      else if (acwr <= 1.3) status = "optimal";
      else if (acwr <= 1.5) status = "high";
      else status = "danger";
    }

    const confidence =
      chronicWindow.length >= 21
        ? "high"
        : chronicWindow.length >= 14
          ? "medium"
          : "low";

    const recommendation =
      status === "danger"
        ? "Acute load is well above baseline. Consider tapering intensity."
        : status === "high"
          ? "Load is elevated. Prioritize recovery and monitor fatigue signals."
          : status === "under"
            ? "Load is below baseline. Gradual progression may improve readiness."
            : status === "optimal"
              ? "Load is in a productive range. Maintain progression carefully."
              : "Not enough data to confidently estimate workload status yet.";

    res.json({
      range,
      status,
      confidence,
      acute,
      previous7,
      chronicWeeklyAvg,
      acwr,
      rampRate,
      recommendation,
      series: workloads,
    });
  } catch (error) {
    console.error("Get Progress Workload Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProgressDayDetail = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

    const dateParam = typeof req.query.date === "string" ? req.query.date : "";
    const date = getISODateError(dateParam);

    if (!date) {
      res.status(400).json({ error: "date is required in YYYY-MM-DD format" });
      return;
    }

    const end = addDaysUTC(date, 1);

    const sessions = await prisma.workoutSession.findMany({
      where: {
        userId,
        startTime: {
          gte: date,
          lt: end,
        },
      },
      include: {
        exercises: {
          include: {
            sets: true,
            exercise: {
              select: {
                id: true,
                name: true,
                category: true,
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
      orderBy: {
        startTime: "asc",
      },
    });

    const sessionDetails = sessions.map((session) => {
      const metrics = computeWorkoutMetrics(session.exercises);
      const durationMin = session.endTime
        ? (session.endTime.getTime() - session.startTime.getTime()) / 60000
        : 0;

      return {
        id: session.id,
        sessionName: session.sessionName,
        labels: session.labels,
        startTime: session.startTime,
        endTime: session.endTime,
        stats: {
          durationMin,
          totalVolume: metrics.totalVolume,
          bodyweightScore: metrics.bodyweightScore,
          exerciseCount: session.exercises.length,
          setCount: session.exercises.reduce(
            (acc, ex) => acc + ex.sets.length,
            0,
          ),
        },
      };
    });

    const exerciseMap = new Map<
      string,
      {
        exerciseId: string;
        name: string;
        category: string;
        sets: number;
        volume: number;
        bodyweightScore: number;
      }
    >();

    for (const session of sessions) {
      for (const entry of session.exercises) {
        const current = exerciseMap.get(entry.exerciseId) ?? {
          exerciseId: entry.exercise.id,
          name: entry.exercise.name,
          category: entry.exercise.category,
          sets: 0,
          volume: 0,
          bodyweightScore: 0,
        };

        const entryMetrics = computeWorkoutMetrics([
          {
            isTimeBased: entry.isTimeBased,
            sets: entry.sets,
            exercise: {
              isBodyweightExercise: entry.exercise.isBodyweightExercise,
              equipment: entry.exercise.equipment,
            },
          },
        ]);

        current.sets += entry.sets.length;
        current.volume += entryMetrics.totalVolume;
        current.bodyweightScore += entryMetrics.bodyweightScore;
        exerciseMap.set(entry.exerciseId, current);
      }
    }

    const exerciseBreakdown = [...exerciseMap.values()].sort(
      (a, b) => b.volume - a.volume,
    );

    const summary = sessionDetails.reduce(
      (acc, session) => {
        acc.sessions += 1;
        acc.totalDurationMin += session.stats.durationMin;
        acc.totalVolume += session.stats.totalVolume;
        acc.bodyweightScore += session.stats.bodyweightScore;
        acc.totalSets += session.stats.setCount;
        return acc;
      },
      {
        sessions: 0,
        totalDurationMin: 0,
        totalVolume: 0,
        bodyweightScore: 0,
        totalSets: 0,
      },
    );

    res.json({
      date: dateParam,
      summary,
      sessions: sessionDetails,
      exerciseBreakdown,
    });
  } catch (error) {
    console.error("Get Progress Day Detail Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 1. Consistency Heatmap (Calendar)
export const getConsistency = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

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
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

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
            exercise: {
              select: {
                isBodyweightExercise: true,
                equipment: true,
              },
            },
          },
        },
      },
      orderBy: { startTime: "asc" },
    });

    // Process data to group by Day
    const volumeMap = new Map<
      string,
      { volume: number; bodyweightScore: number }
    >();

    sessions.forEach((session) => {
      const dateStr = session.startTime.toISOString().split("T")[0];
      const metrics = computeWorkoutMetrics(session.exercises);
      const existing = volumeMap.get(dateStr) || {
        volume: 0,
        bodyweightScore: 0,
      };

      volumeMap.set(dateStr, {
        volume: existing.volume + metrics.totalVolume,
        bodyweightScore: existing.bodyweightScore + metrics.bodyweightScore,
      });
    });

    const data = Array.from(volumeMap.entries()).map(([day, values]) => ({
      day,
      volume: values.volume,
      bodyweightScore: values.bodyweightScore,
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
    const userId = getUserIdOrReject(req, res);
    if (!userId) return;

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
