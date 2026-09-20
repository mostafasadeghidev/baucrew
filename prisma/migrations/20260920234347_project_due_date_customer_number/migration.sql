-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "number" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "dueDate" DATE;

-- CreateIndex
CREATE INDEX "Customer_number_idx" ON "Customer"("number");
