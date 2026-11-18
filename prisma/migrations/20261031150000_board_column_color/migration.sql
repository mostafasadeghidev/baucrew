-- A board's list may wear a colour of its own; null keeps the plain grey.
ALTER TABLE "BoardColumn" ADD COLUMN "color" TEXT;
