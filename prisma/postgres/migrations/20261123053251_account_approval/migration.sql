-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approval" TEXT NOT NULL DEFAULT 'approved',
ADD COLUMN     "approvalRequestedAt" TIMESTAMP(3);

