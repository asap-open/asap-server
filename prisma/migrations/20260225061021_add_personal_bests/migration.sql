-- CreateEnum
CREATE TYPE "PBMetric" AS ENUM ('MaxWeight', 'MaxReps', 'MaxVolume', 'Max1RM', 'MaxDuration', 'MaxDistance');

-- CreateTable
CREATE TABLE "personal_bests" (
    "id" SERIAL NOT NULL,
    "user_id" TEXT NOT NULL,
    "exercise_id" TEXT NOT NULL,
    "metric" "PBMetric" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "achieved_at" TIMESTAMP(3) NOT NULL,
    "session_id" INTEGER,
    "set_id" INTEGER,

    CONSTRAINT "personal_bests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "personal_bests_user_id_exercise_id_metric_key" ON "personal_bests"("user_id", "exercise_id", "metric");

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "global_exercises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "workout_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_bests" ADD CONSTRAINT "personal_bests_set_id_fkey" FOREIGN KEY ("set_id") REFERENCES "sets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
