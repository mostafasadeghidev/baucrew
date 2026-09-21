-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "defectId" TEXT;

-- CreateTable
CREATE TABLE "Defect" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "dueDate" DATE,
    "assigneeId" TEXT,
    "reportedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Defect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Defect_projectId_resolvedAt_idx" ON "Defect"("projectId", "resolvedAt");

-- CreateIndex
CREATE INDEX "Document_defectId_idx" ON "Document"("defectId");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES "Defect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Defect" ADD CONSTRAINT "Defect_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A webhook that listens for every event so far hears of defects too.
UPDATE "WebhookEndpoint"
SET "events" = "events" || ARRAY['defect.reported', 'defect.resolved']::TEXT[]
WHERE "events" @> ARRAY['project.created', 'project.status_changed', 'project.updated', 'project.deleted', 'invoice.ready', 'comment.created']::TEXT[]
  AND NOT ('defect.reported' = ANY("events"));
