/*
  Warnings:

  - Added the required column `average_price` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "average_price" DOUBLE PRECISION NOT NULL;
