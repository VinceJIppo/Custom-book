-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedEmailHash" TEXT,
ADD COLUMN     "deletedUsage" JSONB;

-- CreateIndex
CREATE INDEX "User_deletedEmailHash_idx" ON "User"("deletedEmailHash");
