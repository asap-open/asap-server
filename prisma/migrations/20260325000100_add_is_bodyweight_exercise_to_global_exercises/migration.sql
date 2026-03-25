ALTER TABLE "global_exercises"
ADD COLUMN "is_bodyweight_exercise" BOOLEAN NOT NULL DEFAULT false;

UPDATE "global_exercises"
SET "is_bodyweight_exercise" = true
WHERE LOWER("equipment") LIKE '%body%';
