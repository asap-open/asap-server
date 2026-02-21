-- CreateEnum
CREATE TYPE "SessionLabel" AS ENUM ('Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Legs', 'Glutes', 'FullBody', 'Cardio', 'Mobility', 'Stretching');

-- AlterTable
ALTER TABLE "workout_sessions" ADD COLUMN     "labels" "SessionLabel"[];
