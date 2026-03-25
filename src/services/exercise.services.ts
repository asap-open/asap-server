import { prisma } from "../utils/prisma.js";
type JsonValue = any;
export interface SearchParams {
  muscle?: string | string[];
  category?: string;
  equipment?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: string;
  equipment: string;
  isBodyweightExercise: boolean;
  primaryMuscles: JsonValue;
  secondaryMuscles: JsonValue | null;
  instructions: string | null;
  isCustom: boolean;
  createdBy: string | null;
}

const isBodyweightEquipment = (equipment: string) =>
  equipment.toLowerCase().includes("body");

export interface SearchResult {
  data: Exercise[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export interface ExerciseCacheItem {
  id: string;
  name: string;
  category: string;
  equipment: string;
  isBodyweightExercise: boolean;
  primaryMuscles: JsonValue;
  secondaryMuscles: JsonValue | null;
  instructions: string | null;
  isCustom: boolean;
  createdBy: string | null;
}

export class ExerciseService {
  async getLastUpdated(userId?: string): Promise<string | null> {
    const latest = await prisma.globalExercise.findFirst({
      where: {
        OR: [{ isCustom: false }, { createdBy: userId }],
      },
      select: {
        updatedAt: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    return latest?.updatedAt.toISOString() ?? null;
  }

  async getAllExercises(userId?: string): Promise<ExerciseCacheItem[]> {
    return prisma.globalExercise.findMany({
      where: {
        OR: [{ isCustom: false }, { createdBy: userId }],
      },
      select: {
        id: true,
        name: true,
        category: true,
        equipment: true,
        isBodyweightExercise: true,
        primaryMuscles: true,
        secondaryMuscles: true,
        instructions: true,
        isCustom: true,
        createdBy: true,
      },
      orderBy: [{ isCustom: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Main search function with database filtering and pagination
   */
  async searchExercises(params: SearchParams): Promise<SearchResult> {
    const {
      muscle,
      category,
      equipment,

      userId,
      limit = 50,
      offset = 0,
    } = params;

    // Build base filter
    const where: any = {
      OR: [{ isCustom: false }, { createdBy: userId }],
    };

    // Add filters
    const filters: any[] = [];

    if (category) {
      filters.push({ category: { equals: category, mode: "insensitive" } });
    }

    if (equipment) {
      filters.push({ equipment: { equals: equipment, mode: "insensitive" } });
    }

    // Muscle filter - check both primary and secondary
    if (muscle) {
      const muscles = Array.isArray(muscle) ? muscle : [muscle];
      const muscleFilters = muscles.flatMap((m) => [
        { primaryMuscles: { array_contains: [m.toLowerCase()] } },
        { secondaryMuscles: { array_contains: [m.toLowerCase()] } },
      ]);
      filters.push({ OR: muscleFilters });
    }

    if (filters.length > 0) {
      where.AND = filters;
    }

    const [total, data] = await Promise.all([
      prisma.globalExercise.count({ where }),
      prisma.globalExercise.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: [{ isCustom: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          category: true,
          equipment: true,
          isBodyweightExercise: true,
          primaryMuscles: true,
          secondaryMuscles: true,

          instructions: true,
          isCustom: true,
          createdBy: true,
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Get exercises by specific muscle group
   */
  async getExercisesByMuscle(
    muscle: string,
    userId?: string,
  ): Promise<Exercise[]> {
    const result = await this.searchExercises({
      muscle,
      userId,
      limit: 1000,
    });
    return result.data;
  }

  /**
   * Get exercises by category
   */
  async getExercisesByCategory(
    category: string,
    userId?: string,
  ): Promise<Exercise[]> {
    const result = await this.searchExercises({
      category,
      userId,
      limit: 1000,
    });
    return result.data;
  }

  /**
   * Get exercises by equipment
   */
  async getExercisesByEquipment(
    equipment: string,
    userId?: string,
  ): Promise<Exercise[]> {
    const result = await this.searchExercises({
      equipment,
      userId,
      limit: 1000,
    });
    return result.data;
  }

  /**
   * Get all unique muscle groups
   */
  async getAllMuscleGroups(): Promise<string[]> {
    const exercises = await prisma.globalExercise.findMany({
      select: {
        primaryMuscles: true,
        secondaryMuscles: true,
      },
    });

    const muscles = new Set<string>();
    exercises.forEach((ex) => {
      if (Array.isArray(ex.primaryMuscles)) {
        ex.primaryMuscles.forEach((m) => muscles.add(m as string));
      }
      if (Array.isArray(ex.secondaryMuscles)) {
        ex.secondaryMuscles.forEach((m) => muscles.add(m as string));
      }
    });

    return Array.from(muscles).sort();
  }

  /**
   * Get all unique categories
   */
  async getAllCategories(): Promise<string[]> {
    const exercises = await prisma.globalExercise.findMany({
      select: {
        category: true,
      },
      distinct: ["category"],
    });

    return exercises.map((ex) => ex.category).sort();
  }

  /**
   * Get all unique equipment types
   */
  async getAllEquipment(): Promise<string[]> {
    const exercises = await prisma.globalExercise.findMany({
      select: {
        equipment: true,
      },
      distinct: ["equipment"],
    });

    return exercises.map((ex) => ex.equipment).sort();
  }

  /**
   * Create custom exercise
   */
  async createCustomExercise(
    data: {
      name: string;
      category: string;
      equipment?: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      instructions?: string;
    },
    userId: string,
  ): Promise<Exercise> {
    const slug = this.createSlug(data.name);
    const uniqueSlug = `${slug}-${Date.now()}`;

    return await prisma.globalExercise.create({
      data: {
        id: uniqueSlug,
        name: data.name,
        category: data.category,
        equipment: data.equipment || "Bodyweight",
        isBodyweightExercise: isBodyweightEquipment(
          data.equipment || "Bodyweight",
        ),
        primaryMuscles: data.primaryMuscles || [],
        secondaryMuscles: data.secondaryMuscles || [],
        instructions: data.instructions || null,
        isCustom: true,
        createdBy: userId,
      },
    });
  }

  /**
   * Update custom exercise
   */
  async updateCustomExercise(
    id: string,
    data: {
      name?: string;
      category?: string;
      equipment?: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      instructions?: string;
    },
    userId: string,
  ): Promise<Exercise> {
    // Verify ownership
    const exercise = await prisma.globalExercise.findUnique({
      where: { id },
    });

    if (!exercise) {
      throw new Error("Exercise not found");
    }

    if (!exercise.isCustom || exercise.createdBy !== userId) {
      throw new Error("You can only edit your own custom exercises");
    }

    return await prisma.globalExercise.update({
      where: { id },
      data: {
        ...data,
        ...(data.equipment
          ? { isBodyweightExercise: isBodyweightEquipment(data.equipment) }
          : {}),
      },
    });
  }

  /**
   * Delete custom exercise
   */
  async deleteCustomExercise(id: string, userId: string): Promise<void> {
    // Verify ownership
    const exercise = await prisma.globalExercise.findUnique({
      where: { id },
    });

    if (!exercise) {
      throw new Error("Exercise not found");
    }

    if (!exercise.isCustom || exercise.createdBy !== userId) {
      throw new Error("You can only delete your own custom exercises");
    }

    await prisma.globalExercise.delete({
      where: { id },
    });
  }

  /**
   * Helper to create URL-friendly slug
   */
  private createSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)+/g, "");
  }
}

// Export singleton instance
export const exerciseService = new ExerciseService();
