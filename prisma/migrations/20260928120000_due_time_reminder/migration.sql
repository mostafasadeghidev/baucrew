-- Trello's due time and reminder on a card.
ALTER TABLE "Project" ADD COLUMN "dueTime" TEXT,
ADD COLUMN "dueReminder" INTEGER;
