/*
  Warnings:

  - Added the required column `market_id` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "market_id" TEXT NOT NULL;
