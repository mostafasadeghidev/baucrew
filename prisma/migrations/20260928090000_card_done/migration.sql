-- Trello's tick on a card: marked done, apart from the project's status.
ALTER TABLE "Project" ADD COLUMN "doneAt" TIMESTAMP(3);
