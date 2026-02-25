import { Router } from "express";
import {
  getAllPBs,
  getPBsByExercise,
  syncAllPBs,
  checkSessionPBs,
  deleteAllPBsForExercise,
  deletePB,
} from "../controllers/pb.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

// GET  /api/pbs                              — all PBs (?metric=&exerciseId=&exerciseIds=)
router.get("/", authenticateToken, getAllPBs);

// GET  /api/pbs/:exerciseId                  — all PBs for one exercise
router.get("/:exerciseId", authenticateToken, getPBsByExercise);

// POST /api/pbs/sync                         — full recalculate from history
router.post("/sync", authenticateToken, syncAllPBs);

// POST /api/pbs/check-session/:sessionId     — check one session, upsert if beaten
router.post("/check-session/:sessionId", authenticateToken, checkSessionPBs);

// DELETE /api/pbs/:exerciseId                — remove ALL PB metrics for one exercise
router.delete("/:exerciseId", authenticateToken, deleteAllPBsForExercise);

// DELETE /api/pbs/:exerciseId/:metric        — remove one specific PB metric
router.delete("/:exerciseId/:metric", authenticateToken, deletePB);

export default router;
