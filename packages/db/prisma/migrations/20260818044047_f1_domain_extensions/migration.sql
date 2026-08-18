/*
  Warnings:

  - The `lastLapTime` column on the `DriverTiming` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `bestLapTime` column on the `DriverTiming` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `sector1` column on the `DriverTiming` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `sector2` column on the `DriverTiming` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `sector3` column on the `DriverTiming` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "DriverTiming" ADD COLUMN     "intervalToAhead" TEXT,
DROP COLUMN "lastLapTime",
ADD COLUMN     "lastLapTime" DOUBLE PRECISION,
DROP COLUMN "bestLapTime",
ADD COLUMN     "bestLapTime" DOUBLE PRECISION,
DROP COLUMN "sector1",
ADD COLUMN     "sector1" DOUBLE PRECISION,
DROP COLUMN "sector2",
ADD COLUMN     "sector2" DOUBLE PRECISION,
DROP COLUMN "sector3",
ADD COLUMN     "sector3" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Player" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "shortName" TEXT;

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "colorHex" TEXT;
