-- A project template can carry one or more site checklists; they are copied
-- into every project created from that template.
CREATE TABLE "TemplateChecklist" (
    "templateId" TEXT NOT NULL,
    "checklistTemplateId" TEXT NOT NULL,
    CONSTRAINT "TemplateChecklist_pkey" PRIMARY KEY ("templateId","checklistTemplateId")
);
CREATE INDEX "TemplateChecklist_checklistTemplateId_idx" ON "TemplateChecklist"("checklistTemplateId");
ALTER TABLE "TemplateChecklist" ADD CONSTRAINT "TemplateChecklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateChecklist" ADD CONSTRAINT "TemplateChecklist_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
