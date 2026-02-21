import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  createRoutine,
  deleteRoutine,
  getRoutineById,
  getRoutines,
  updateRoutine,
} from "../controllers/routine.controller.js";

const router = Router();

// Apply auth middleware to all routine routes
router.use(authenticateToken);

router.post("/", createRoutine);
router.get("/", getRoutines);
router.get("/:id", getRoutineById);
router.put("/:id", updateRoutine);
router.delete("/:id", deleteRoutine);

export default router;
