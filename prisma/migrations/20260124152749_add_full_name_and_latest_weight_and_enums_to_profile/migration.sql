/*
  Warnings:

  - The `unit_pref` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `gender` column on the `user_profiles` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "UnitPreference" AS ENUM ('kg', 'lbs');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other');

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "full_name" TEXT,
ADD COLUMN     "latest_weight_kg" DOUBLE PRECISION,
DROP COLUMN "unit_pref",
ADD COLUMN     "unit_pref" "UnitPreference" NOT NULL DEFAULT 'kg',
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender";
