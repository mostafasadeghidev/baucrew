-- Absences (holiday, sick, other) — warn while planning instead of finding out on site.
CREATE TABLE "Absence" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Absence_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Absence_employeeId_idx" ON "Absence"("employeeId");
CREATE INDEX "Absence_startDate_endDate_idx" ON "Absence"("startDate", "endDate");
ALTER TABLE "Absence" ADD CONSTRAINT "Absence_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Files on a project: the scaffold's unused Document table becomes the real
-- attachment store. `source` says where a file came from (manual upload today;
-- card/mail/extraction later), `visibleToCrew` keeps offers with prices away
-- from the worker area by default.
ALTER TABLE "Document" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Document" ADD COLUMN "visibleToCrew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Document" ADD COLUMN "uploadedById" TEXT;
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Document_path_key" ON "Document"("path");

-- Small fields from the meetings: priority and lead source on a project,
-- an instruction-video link on a catalog item (tool/device).
ALTER TABLE "Project" ADD COLUMN "priority" TEXT;
ALTER TABLE "Project" ADD COLUMN "leadSource" TEXT;
ALTER TABLE "CatalogItem" ADD COLUMN "videoUrl" TEXT;
