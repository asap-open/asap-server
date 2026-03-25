interface MetricSet {
  weight: number;
  reps: number;
}

interface MetricExercise {
  isTimeBased: boolean;
  sets: MetricSet[];
  exercise?: {
    isBodyweightExercise?: boolean;
    equipment?: string;
  };
}

const isBodyweightExercise = (exercise?: {
  isBodyweightExercise?: boolean;
  equipment?: string;
}) => {
  if (!exercise) return false;
  if (exercise.isBodyweightExercise === true) return true;
  if (!exercise.equipment) return false;
  return exercise.equipment.toLowerCase().includes("body");
};

export function computeWorkoutMetrics(exercises: MetricExercise[]): {
  totalVolume: number;
  bodyweightScore: number;
} {
  return exercises.reduce(
    (acc, exercise) => {
      if (exercise.isTimeBased) {
        return acc;
      }

      const isBodyweight = isBodyweightExercise(exercise.exercise);

      exercise.sets.forEach((set) => {
        acc.totalVolume += set.weight * set.reps;
        if (isBodyweight) {
          acc.bodyweightScore += set.reps;
        }
      });

      return acc;
    },
    { totalVolume: 0, bodyweightScore: 0 },
  );
}
