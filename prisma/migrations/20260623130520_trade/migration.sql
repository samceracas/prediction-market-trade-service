-- AlterTable
ALTER TABLE "Trade" ALTER COLUMN "updated_at" DROP NOT NULL,
ALTER COLUMN "deleted_at" DROP NOT NULL;
