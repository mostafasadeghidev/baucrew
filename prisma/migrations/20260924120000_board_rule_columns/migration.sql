-- A list may hold only some of a status's cards — the paused ones, the ones
-- for next year — so a board can have two lists for one status. And a
-- running job can be on hold.
ALTER TABLE "BoardColumn" ADD COLUMN "rule" TEXT;
DROP INDEX "BoardColumn_boardId_status_key";
CREATE INDEX "BoardColumn_boardId_idx" ON "BoardColumn"("boardId");

ALTER TABLE "Project" ADD COLUMN "pausedAt" TIMESTAMP(3);
