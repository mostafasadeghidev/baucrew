-- CreateTable
CREATE TABLE "TrelloSyncBoard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "includeArchived" BOOLEAN NOT NULL DEFAULT true,
    "makeBoard" BOOLEAN NOT NULL DEFAULT true,
    "oneCustomer" BOOLEAN,
    "listStatus" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastResult" TEXT,
    "lastError" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrelloSyncBoard_pkey" PRIMARY KEY ("id")
);
