import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  logWeight,
  getWeightHistory,
} from "../controllers/weight.controller.js";

const router = Router();
router.use(authenticateToken);

router.post("/", logWeight);
router.get("/history", getWeightHistory);

export default router;
