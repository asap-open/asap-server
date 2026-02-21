import { prisma } from "../utils/prisma.js";
type JsonValue = any;
export interface SearchParams {
  q?: string;
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
  primaryMuscles: JsonValue;
  secondaryMuscles: JsonValue | null;
  instructions: string | null;
  isCustom: boolean;
  createdBy: string | null;
}

export interface SearchResult {
  data: Exercise[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export class ExerciseService {
  /**
   * Main search function with relevance scoring
   */
  async searchExercises(params: SearchParams): Promise<SearchResult> {
    const {
      q,
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

    // Fetch exercises
    const exercises = await prisma.globalExercise.findMany({
      where,
      select: {
        id: true,
        name: true,
        category: true,
        equipment: true,
        primaryMuscles: true,
        secondaryMuscles: true,

        instructions: true,
        isCustom: true,
        createdBy: true,
      },
    });

    // Apply search query with relevance scoring if provided
    let results = exercises;
    if (q) {
      results = this.searchWithRelevance(exercises, q);
    }

    // Get total before pagination
    const total = results.length;

    // Paginate
    const paginatedResults = results.slice(offset, offset + limit);

    return {
      data: paginatedResults,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  /**
   * Search with relevance scoring
   */
  private searchWithRelevance(
    exercises: Exercise[],
    query: string,
  ): Exercise[] {
    const q = query.toLowerCase().trim();

    // Score each exercise
    const scored = exercises.map((exercise) => ({
      exercise,
      score: this.calculateRelevanceScore(exercise, q),
    }));

    // Filter out non-matches (score = 0) and sort by score
    return scored
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.exercise);
  }

  /**
   * Calculate relevance score for an exercise
   */
  private calculateRelevanceScore(exercise: Exercise, query: string): number {
    let score = 0;
    const name = exercise.name.toLowerCase();
    const category = exercise.category.toLowerCase();
    const equipment = exercise.equipment.toLowerCase();
    const primaryMuscles = Array.isArray(exercise.primaryMuscles)
      ? exercise.primaryMuscles.map((m) => (m as string).toLowerCase())
      : [];
    const secondaryMuscles = Array.isArray(exercise.secondaryMuscles)
      ? exercise.secondaryMuscles.map((m) => (m as string).toLowerCase())
      : [];

    // Exact name match - highest priority
    if (name === query) {
      score += 100;
    }
    // Name starts with query - high priority
    else if (name.startsWith(query)) {
      score += 80;
    }
    // Name contains query - medium priority
    else if (name.includes(query)) {
      score += 60;
    }

    // Check if query matches words in name (word boundary)
    const nameWords = name.split(/[\s-]+/);
    if (nameWords.some((word) => word === query)) {
      score += 70;
    } else if (nameWords.some((word) => word.startsWith(query))) {
      score += 50;
    }

    // Primary muscle match - medium priority
    if (primaryMuscles.some((m) => m.includes(query))) {
      score += 50;
    }

    // Secondary muscle match - lower priority
    if (secondaryMuscles.some((m) => m.includes(query))) {
      score += 30;
    }

    // Equipment match - lower priority
    if (equipment.includes(query)) {
      score += 20;
    }

    // Category match - lowest priority
    if (category.includes(query)) {
      score += 10;
    }

    return score;
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
      data,
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
