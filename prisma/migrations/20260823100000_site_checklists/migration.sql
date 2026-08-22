-- Site checklists: reusable templates and per-project checklists that the crew
-- ticks off on the phone (previous trades finished or not, damages, …).
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChecklistTemplateItem_templateId_idx" ON "ChecklistTemplateItem"("templateId");
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectChecklist" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectChecklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectChecklist_projectId_idx" ON "ProjectChecklist"("projectId");
ALTER TABLE "ProjectChecklist" ADD CONSTRAINT "ProjectChecklist_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectChecklistItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3),
    "checkedById" TEXT,
    CONSTRAINT "ProjectChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectChecklistItem_checklistId_idx" ON "ProjectChecklistItem"("checklistId");
CREATE INDEX "ProjectChecklistItem_checkedById_idx" ON "ProjectChecklistItem"("checkedById");
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "ProjectChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectChecklistItem" ADD CONSTRAINT "ProjectChecklistItem_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
