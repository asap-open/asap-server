import { Router } from "express";
import { getProgressOverview } from "../controllers/progress.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/overview", authenticateToken, getProgressOverview);

export default router;
