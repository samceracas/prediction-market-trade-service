/*
  Warnings:

  - You are about to drop the column `average_price` on the `Trade` table. All the data in the column will be lost.
  - Added the required column `price` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "average_price",
ADD COLUMN     "price" DOUBLE PRECISION NOT NULL;
