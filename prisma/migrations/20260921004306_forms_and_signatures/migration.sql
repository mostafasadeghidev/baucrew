-- CreateTable
CREATE TABLE "FormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fields" JSONB NOT NULL,
    "signers" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilledForm" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT,
    "title" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "signers" JSONB NOT NULL,
    "values" JSONB NOT NULL,
    "createdById" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilledForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSignature" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "takenById" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "FormSignature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FilledForm_documentId_key" ON "FilledForm"("documentId");

-- CreateIndex
CREATE INDEX "FilledForm_projectId_idx" ON "FilledForm"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "FormSignature_formId_slot_key" ON "FormSignature"("formId", "slot");

-- AddForeignKey
ALTER TABLE "FilledForm" ADD CONSTRAINT "FilledForm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilledForm" ADD CONSTRAINT "FilledForm_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FormTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilledForm" ADD CONSTRAINT "FilledForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilledForm" ADD CONSTRAINT "FilledForm_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FilledForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSignature" ADD CONSTRAINT "FormSignature_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every installation starts with the form a painter needs first. A template
-- like any other afterwards: the office renames, extends or switches it off.
INSERT INTO "FormTemplate" ("id", "name", "description", "fields", "signers", "active", "sortOrder", "createdAt", "updatedAt")
VALUES ('form_acceptance', 'Abnahmeprotokoll', 'Abnahme der ausgeführten Arbeiten mit Unterschrift von Auftraggeber und Auftragnehmer.', '[{"id":"h_project","type":"heading","label":"Bauvorhaben"},{"id":"project_number","type":"text","label":"Projektnummer","prefill":"projectNumber"},{"id":"project_name","type":"text","label":"Bauvorhaben","prefill":"projectName","required":true},{"id":"customer","type":"text","label":"Auftraggeber","prefill":"customerName","required":true},{"id":"site","type":"text","label":"Baustelle","prefill":"siteAddress"},{"id":"contractor","type":"text","label":"Auftragnehmer","prefill":"companyName"},{"id":"manager","type":"text","label":"Bauleitung","prefill":"manager"},{"id":"h_work","type":"heading","label":"Leistung"},{"id":"work","type":"longtext","label":"Ausgeführte Leistungen","prefill":"workTypes"},{"id":"date","type":"date","label":"Datum der Abnahme","prefill":"today","required":true},{"id":"h_result","type":"heading","label":"Abnahme"},{"id":"result","type":"choice","label":"Ergebnis","required":true,"options":["Abnahme ohne Mängel","Abnahme mit Mängeln (siehe unten)","Abnahme verweigert"]},{"id":"defects","type":"longtext","label":"Festgestellte Mängel","prefill":"openDefects"},{"id":"deadline","type":"date","label":"Frist zur Mängelbeseitigung"},{"id":"remarks","type":"longtext","label":"Bemerkungen"},{"id":"handover","type":"checkbox","label":"Die Baustelle wurde besenrein übergeben."}]'::jsonb, '["Auftraggeber","Auftragnehmer"]'::jsonb, true, 0, NOW(), NOW());
