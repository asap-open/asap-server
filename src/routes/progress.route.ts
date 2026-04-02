import { Router } from "express";
import {
  getProgressSummary,
  getProgressCalendar,
  getProgressTimeSeries,
  getProgressMuscleBalance,
  getProgressPBTimeline,
  getProgressStrength1RM,
  getProgressWorkload,
  getProgressDayDetail,
  getConsistency,
  getVolumeStats,
  getMuscleDistribution,
} from "../controllers/progress.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// V2 endpoints (backend-first rebuild)
router.get("/summary", authenticateToken, getProgressSummary);
router.get("/calendar", authenticateToken, getProgressCalendar);
router.get("/timeseries", authenticateToken, getProgressTimeSeries);
router.get("/muscle-balance", authenticateToken, getProgressMuscleBalance);
router.get("/pbs/timeline", authenticateToken, getProgressPBTimeline);
router.get("/strength/1rm", authenticateToken, getProgressStrength1RM);
router.get("/workload", authenticateToken, getProgressWorkload);
router.get("/day-detail", authenticateToken, getProgressDayDetail);

// Legacy endpoints kept for compatibility during migration
router.get("/consistency", authenticateToken, getConsistency);
router.get("/volume", authenticateToken, getVolumeStats);
router.get("/muscles", authenticateToken, getMuscleDistribution);

export default router;
