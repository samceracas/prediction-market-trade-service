/*
  Warnings:

  - You are about to drop the column `price` on the `Trade` table. All the data in the column will be lost.
  - Added the required column `amount` to the `Trade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `Trade` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TradeType" AS ENUM ('BUY', 'SELL');

-- AlterTable
ALTER TABLE "Trade" DROP COLUMN "price",
ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "type" "TradeType" NOT NULL;
