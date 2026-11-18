-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('INBOX', 'TODO', 'DECISION', 'IN_PROGRESS', 'DONE', 'CLOSED');

-- CreateTable
CREATE TABLE "FeedbackItem" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'INBOX',
    "source" TEXT NOT NULL DEFAULT 'comment',
    "waitingOn" TEXT,
    "officeOnly" BOOLEAN NOT NULL DEFAULT false,
    "page" TEXT NOT NULL DEFAULT '',
    "anchor" JSONB,
    "metadata" JSONB,
    "context" JSONB,
    "suggestion" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT '',
    "beforeText" TEXT NOT NULL DEFAULT '',
    "afterText" TEXT NOT NULL DEFAULT '',
    "completionNote" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackNote" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "choice" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL DEFAULT '',
    "itemVersion" INTEGER NOT NULL,
    "evidence" JSONB,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackStatusChange" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fromStatus" "FeedbackStatus",
    "toStatus" "FeedbackStatus" NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'screenshot',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "path" TEXT NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackItem_number_key" ON "FeedbackItem"("number");

-- CreateIndex
CREATE INDEX "FeedbackItem_status_idx" ON "FeedbackItem"("status");

-- CreateIndex
CREATE INDEX "FeedbackItem_createdAt_idx" ON "FeedbackItem"("createdAt");

-- CreateIndex
CREATE INDEX "FeedbackNote_itemId_createdAt_idx" ON "FeedbackNote"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackStatusChange_itemId_createdAt_idx" ON "FeedbackStatusChange"("itemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FeedbackAttachment_path_key" ON "FeedbackAttachment"("path");

-- CreateIndex
CREATE INDEX "FeedbackAttachment_itemId_idx" ON "FeedbackAttachment"("itemId");

-- AddForeignKey
ALTER TABLE "FeedbackItem" ADD CONSTRAINT "FeedbackItem_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FeedbackItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackNote" ADD CONSTRAINT "FeedbackNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackStatusChange" ADD CONSTRAINT "FeedbackStatusChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FeedbackItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackStatusChange" ADD CONSTRAINT "FeedbackStatusChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "FeedbackItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackAttachment" ADD CONSTRAINT "FeedbackAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

