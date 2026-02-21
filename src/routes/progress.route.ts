import { Router } from "express";
import {
  getConsistency,
  getVolumeStats,
  getMuscleDistribution,
  getPersonalBests,
} from "../controllers/progress.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/consistency", authenticateToken, getConsistency);
router.get("/volume", authenticateToken, getVolumeStats);
router.get("/muscles", authenticateToken, getMuscleDistribution);
router.get("/pbs", authenticateToken, getPersonalBests);

export default router;
