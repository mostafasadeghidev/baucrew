-- CreateEnum
CREATE TYPE "DocumentationKind" AS ENUM ('TEXT', 'IMAGE', 'PDF', 'VOICE');

-- CreateEnum
CREATE TYPE "TranscriptionState" AS ENUM ('PENDING', 'DONE', 'FAILED', 'OFF');

-- CreateTable
CREATE TABLE "DocumentationEntry" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "DocumentationKind" NOT NULL,
    "text" TEXT,
    "transcription" "TranscriptionState",
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "DocumentationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentationFile" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "durationMs" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentationEntry_projectId_createdAt_idx" ON "DocumentationEntry"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentationFile_path_key" ON "DocumentationFile"("path");

-- CreateIndex
CREATE INDEX "DocumentationFile_entryId_idx" ON "DocumentationFile"("entryId");

-- AddForeignKey
ALTER TABLE "DocumentationEntry" ADD CONSTRAINT "DocumentationEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationEntry" ADD CONSTRAINT "DocumentationEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentationFile" ADD CONSTRAINT "DocumentationFile_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "DocumentationEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
