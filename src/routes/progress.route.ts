import { Router } from "express";
import {
  getProgressHeatmap,
  getProgressMetrics,
  getVolumeTracking,
} from "../controllers/progress.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/heatmap", authenticateToken, getProgressHeatmap);
router.get("/metrics", authenticateToken, getProgressMetrics);
router.get("/volume", authenticateToken, getVolumeTracking);

export default router;
