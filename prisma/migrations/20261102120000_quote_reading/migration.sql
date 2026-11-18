-- CreateEnum
CREATE TYPE "QuoteKind" AS ENUM ('QUOTE', 'OTHER', 'SCAN', 'FAILED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jobNumberFromQuote" TEXT,
ADD COLUMN     "priceFromQuote" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "DocumentQuote" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "kind" "QuoteKind" NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'text',
    "version" INTEGER NOT NULL DEFAULT 1,
    "docType" TEXT,
    "quoteNumber" TEXT,
    "jobNumber" TEXT,
    "quoteDate" DATE,
    "net" DECIMAL(12,2),
    "vat" DECIMAL(12,2),
    "vatRate" DECIMAL(5,2),
    "gross" DECIMAL(12,2),
    "inTotal" BOOLEAN NOT NULL DEFAULT true,
    "excludedReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentQuote_documentId_key" ON "DocumentQuote"("documentId");

-- CreateIndex
CREATE INDEX "DocumentQuote_kind_idx" ON "DocumentQuote"("kind");

-- AddForeignKey
ALTER TABLE "DocumentQuote" ADD CONSTRAINT "DocumentQuote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentQuote" ADD CONSTRAINT "DocumentQuote_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

