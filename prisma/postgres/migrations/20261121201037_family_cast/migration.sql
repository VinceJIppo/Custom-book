-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "castSnapshot" JSONB;

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "about" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'child',
ADD COLUMN     "look" TEXT,
ADD COLUMN     "relationship" TEXT;

