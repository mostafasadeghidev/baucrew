-- Trello's checklist items: somebody to see to one, and a day it is due by.
ALTER TABLE "ProjectChecklistItem" ADD COLUMN "assigneeId" TEXT,
ADD COLUMN "dueDate" DATE;

CREATE INDEX "ProjectChecklistItem_assigneeId_idx" ON "ProjectChecklistItem"("assigneeId");

ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
