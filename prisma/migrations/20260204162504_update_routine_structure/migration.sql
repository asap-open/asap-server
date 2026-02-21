-- AlterTable
ALTER TABLE "routines" ADD COLUMN     "labels" "SessionLabel"[];

-- CreateTable
CREATE TABLE "routine_sets" (
    "id" SERIAL NOT NULL,
    "routine_exercise_id" INTEGER NOT NULL,
    "set_index" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION,
    "reps" INTEGER,
    "distance" DOUBLE PRECISION,
    "duration_sec" INTEGER,
    "is_hard_set" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "routine_sets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "routine_sets" ADD CONSTRAINT "routine_sets_routine_exercise_id_fkey" FOREIGN KEY ("routine_exercise_id") REFERENCES "routine_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;
