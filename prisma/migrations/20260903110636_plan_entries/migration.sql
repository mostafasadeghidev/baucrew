-- CreateTable
CREATE TABLE "PlanEntry" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isSub" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL DEFAULT 'excel',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanEntry_year_month_idx" ON "PlanEntry"("year", "month");
