-- The client's Trello cards carry two things a project did not have: the day
-- of the site visit, and the customer's own words for when the work should be
-- done. A comment can be put right by its author and answered with a sign.
ALTER TABLE "Project" ADD COLUMN "inspectionDate" DATE;
ALTER TABLE "Project" ADD COLUMN "executionWish" TEXT;

ALTER TABLE "Note" ADD COLUMN "editedAt" TIMESTAMP(3);

CREATE TABLE "NoteReaction" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NoteReaction_noteId_userId_emoji_key" ON "NoteReaction"("noteId", "userId", "emoji");
CREATE INDEX "NoteReaction_noteId_idx" ON "NoteReaction"("noteId");

ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NoteReaction" ADD CONSTRAINT "NoteReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
