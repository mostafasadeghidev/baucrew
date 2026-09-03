-- AlterTable
ALTER TABLE "PlanEntry" ADD COLUMN     "projectId" TEXT;

-- CreateIndex
CREATE INDEX "PlanEntry_projectId_idx" ON "PlanEntry"("projectId");

-- AddForeignKey
ALTER TABLE "PlanEntry" ADD CONSTRAINT "PlanEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
