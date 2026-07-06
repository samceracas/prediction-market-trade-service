-- AlterTable
ALTER TABLE "Asset" ALTER COLUMN "display_order" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "liquidity_b" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Trade" ADD COLUMN     "prices_snapshot" JSONB;
