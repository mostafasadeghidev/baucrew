-- Inbound drafts: everything arriving from outside (Excel import, board
-- automation, AI extraction) becomes a draft the office confirms — never a
-- live project directly.
CREATE TABLE "ProjectDraft" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "name" TEXT NOT NULL,
    "customerName" TEXT,
    "street" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "price" DECIMAL(12,2),
    "plannedStart" DATE,
    "plannedEnd" DATE,
    "description" TEXT,
    "externalSystem" TEXT,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "payload" JSONB,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProjectDraft_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProjectDraft_externalSystem_externalId_key" ON "ProjectDraft"("externalSystem", "externalId");
CREATE INDEX "ProjectDraft_status_idx" ON "ProjectDraft"("status");

-- Link back to the source record (board card, external offer, import row).
ALTER TABLE "Project" ADD COLUMN "externalSystem" TEXT;
ALTER TABLE "Project" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Project" ADD COLUMN "externalUrl" TEXT;
CREATE INDEX "Project_externalSystem_externalId_idx" ON "Project"("externalSystem", "externalId");
