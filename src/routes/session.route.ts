import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  createSession,
  getSessions,
  getSessionById,
  deleteSession,
  updateSession,
  getCalendarStats,
} from "../controllers/session.controller.js";

const router = Router();

// Apply auth middleware to all routes in this router
router.use(authenticateToken);

// GET /api/sessions/stats/calendar -> Calendar heatmap data
router.get("/stats/calendar", getCalendarStats);

// GET /api/sessions -> List history
router.get("/", getSessions);

// GET /api/sessions/:id -> Get specific session details
router.get("/:id", getSessionById);

// POST /api/sessions -> Start/Log a new session
router.post("/", createSession);

// PUT /api/sessions/:id -> Update session (Sync workout)
router.put("/:id", updateSession);

// DELETE /api/sessions/:id -> Remove a session
router.delete("/:id", deleteSession);

export default router;
