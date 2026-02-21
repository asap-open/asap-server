import { Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware.js";
import { exerciseService } from "../services/exercise.services.js";

// 1. Search Exercises (NEW - Main search endpoint)
export const searchExercises = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { q, muscle, category, equipment, limit, offset } = req.query;

    const limitStr = Array.isArray(limit) ? limit[0] : limit;
    const offsetStr = Array.isArray(offset) ? offset[0] : offset;

    const result = await exerciseService.searchExercises({
      q: q as string,
      muscle: muscle as string | string[],
      category: category as string,
      equipment: equipment as string,

      userId,
      limit: limitStr ? parseInt(String(limitStr), 10) : undefined,
      offset: offsetStr ? parseInt(String(offsetStr), 10) : undefined,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Search Exercises Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 2. Get Exercises (Keep for backward compatibility, but simplified)
export const getExercises = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const search = req.query.search as string;
    const muscle = req.query.muscle;
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    const pageStr = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;
    const limitStr = Array.isArray(limitRaw) ? limitRaw[0] : limitRaw;
    const page = pageStr ? parseInt(String(pageStr), 10) : 1;
    const limit = limitStr ? parseInt(String(limitStr), 10) : 20;
    const offset = (page - 1) * limit;

    const result = await exerciseService.searchExercises({
      q: search,
      muscle: muscle as string | string[],
      userId,
      limit,
      offset,
    });

    res.status(200).json({
      data: result.data,
      meta: {
        page,
        limit,
        total: result.meta.total,
        totalPages: Math.ceil(result.meta.total / limit),
      },
    });
  } catch (error) {
    console.error("Get Exercises Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 3. Get Exercises by Muscle (NEW)
export const getExercisesByMuscle = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    let { muscle } = req.params;
    if (Array.isArray(muscle)) muscle = muscle[0];

    const exercises = await exerciseService.getExercisesByMuscle(
      muscle,
      userId,
    );

    res.status(200).json({
      data: exercises,
      muscle,
      total: exercises.length,
    });
  } catch (error) {
    console.error("Get Exercises by Muscle Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 4. Get Exercises by Category (NEW)
export const getExercisesByCategory = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    let { category } = req.params;
    if (Array.isArray(category)) category = category[0];

    const exercises = await exerciseService.getExercisesByCategory(
      category,
      userId,
    );

    res.status(200).json({
      data: exercises,
      category,
      total: exercises.length,
    });
  } catch (error) {
    console.error("Get Exercises by Category Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 5. Get All Muscle Groups (NEW)
export const getAllMuscleGroups = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const muscles = await exerciseService.getAllMuscleGroups();
    res.status(200).json({ data: muscles });
  } catch (error) {
    console.error("Get Muscle Groups Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 6. Get All Categories (NEW)
export const getAllCategories = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const categories = await exerciseService.getAllCategories();
    res.status(200).json({ data: categories });
  } catch (error) {
    console.error("Get Categories Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 7. Get All Equipment (NEW)
export const getAllEquipment = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const equipment = await exerciseService.getAllEquipment();
    res.status(200).json({ data: equipment });
  } catch (error) {
    console.error("Get Equipment Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 8. Create Custom Exercise
export const createCustomExercise = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const {
      name,
      category,
      equipment,
      primaryMuscles,
      secondaryMuscles,
      instructions,
    } = req.body;

    if (!name || !category) {
      res.status(400).json({ error: "Name and Category are required" });
      return;
    }

    const newExercise = await exerciseService.createCustomExercise(
      {
        name,
        category,
        equipment,
        primaryMuscles,
        secondaryMuscles,
        instructions,
      },
      userId,
    );

    res.status(201).json(newExercise);
  } catch (error) {
    console.error("Create Exercise Error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// 9. Update Custom Exercise
export const updateExercise = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;
    const {
      name,
      category,
      equipment,
      primaryMuscles,
      secondaryMuscles,
      instructions,
    } = req.body;

    const updated = await exerciseService.updateCustomExercise(
      id as string,
      {
        name,
        category,
        equipment,
        primaryMuscles,
        secondaryMuscles,
        instructions,
      },
      userId,
    );

    res.status(200).json(updated);
  } catch (error: any) {
    console.error("Update Exercise Error:", error);
    if (error.message === "Exercise not found") {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes("only edit your own")) {
      res.status(403).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

// 10. Delete Custom Exercise
export const deleteExercise = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const { id } = req.params;

    await exerciseService.deleteCustomExercise(id as string, userId);

    res.status(200).json({ message: "Exercise deleted successfully" });
  } catch (error: any) {
    console.error("Delete Exercise Error:", error);
    if (error.message === "Exercise not found") {
      res.status(404).json({ error: error.message });
    } else if (error.message.includes("only delete your own")) {
      res.status(403).json({ error: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
