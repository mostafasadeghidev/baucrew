-- CreateTable
CREATE TABLE "ProjectInvoice" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "part" INTEGER NOT NULL,
    "number" TEXT,
    "amount" DECIMAL(12,2),
    "readyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectInvoice_projectId_part_key" ON "ProjectInvoice"("projectId", "part");

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectInvoice" ADD CONSTRAINT "ProjectInvoice_readyById_fkey" FOREIGN KEY ("readyById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A webhook that listens for every project event hears of ready invoices too.
UPDATE "WebhookEndpoint"
SET "events" = array_append("events", 'invoice.ready')
WHERE "events" @> ARRAY['project.created', 'project.status_changed', 'project.updated', 'project.deleted']::TEXT[]
  AND NOT ('invoice.ready' = ANY("events"));
