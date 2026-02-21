import { Router } from "express";
import {
  getProfile,
  updateProfile,
  updateUsername,
} from "../controllers/profile.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// All profile routes require authentication
router.get("/", authenticateToken, getProfile);
router.put("/", authenticateToken, updateProfile);
router.put("/username", authenticateToken, updateUsername);

export default router;
