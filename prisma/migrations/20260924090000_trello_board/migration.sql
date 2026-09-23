-- The board the way Trello draws one: a card keeps the place it was put in
-- its column, can be archived off the board, and may wear a photo on its front.
ALTER TABLE "Project" ADD COLUMN "boardPosition" DOUBLE PRECISION,
                      ADD COLUMN "archivedAt" TIMESTAMP(3),
                      ADD COLUMN "coverDocumentId" TEXT;

CREATE UNIQUE INDEX "Project_coverDocumentId_key" ON "Project"("coverDocumentId");
CREATE INDEX "Project_archivedAt_idx" ON "Project"("archivedAt");

ALTER TABLE "Project" ADD CONSTRAINT "Project_coverDocumentId_fkey"
  FOREIGN KEY ("coverDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every board stands on a ground now, the way every Trello board does; the
-- ones that had none get Trello's blue. "None" stays a choice in the settings.
UPDATE "Board" SET "background" = 'blue' WHERE "background" IS NULL;
