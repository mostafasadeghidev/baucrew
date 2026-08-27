-- "This kind of job needs these machines" — a wish list on a template and on a
-- project. Separate from DeviceAssignment on purpose: a need says what should
-- be there, a handout says what physically is.
CREATE TABLE "TemplateDevice" (
    "templateId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    CONSTRAINT "TemplateDevice_pkey" PRIMARY KEY ("templateId","deviceId")
);
CREATE INDEX "TemplateDevice_deviceId_idx" ON "TemplateDevice"("deviceId");
ALTER TABLE "TemplateDevice" ADD CONSTRAINT "TemplateDevice_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateDevice" ADD CONSTRAINT "TemplateDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProjectDevice" (
    "projectId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    CONSTRAINT "ProjectDevice_pkey" PRIMARY KEY ("projectId","deviceId")
);
CREATE INDEX "ProjectDevice_deviceId_idx" ON "ProjectDevice"("deviceId");
ALTER TABLE "ProjectDevice" ADD CONSTRAINT "ProjectDevice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectDevice" ADD CONSTRAINT "ProjectDevice_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
