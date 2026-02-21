import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import {
  searchExercises,
  getExercises,
  getExercisesByMuscle,
  getExercisesByCategory,
  getAllMuscleGroups,
  getAllCategories,
  getAllEquipment,
  createCustomExercise,
  updateExercise,
  deleteExercise,
} from "../controllers/exercise.controller.js";

const router = Router();
router.use(authenticateToken);

// Search endpoint - main endpoint for filtering and searching
router.get("/search", searchExercises);

// Filter endpoints
router.get("/by-muscle/:muscle", getExercisesByMuscle);
router.get("/by-category/:category", getExercisesByCategory);

// Metadata endpoints
router.get("/muscles", getAllMuscleGroups);
router.get("/categories", getAllCategories);
router.get("/equipment", getAllEquipment);

// CRUD endpoints
router.get("/", getExercises);
router.post("/", createCustomExercise);
router.put("/:id", updateExercise);
router.delete("/:id", deleteExercise);

export default router;
