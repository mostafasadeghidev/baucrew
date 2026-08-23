-- Follow-on offers ("Nachträge"): extra order value accepted after the main
-- order, so the reported figures match the customer's own numbers.
CREATE TABLE "ProjectAddOn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectAddOn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ProjectAddOn_projectId_idx" ON "ProjectAddOn"("projectId");
ALTER TABLE "ProjectAddOn" ADD CONSTRAINT "ProjectAddOn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
