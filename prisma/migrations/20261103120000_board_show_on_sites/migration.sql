-- Baustellen (/sites) shows one board: the one with this tick. One board at
-- most has it; the app keeps it so when the tick is saved.
ALTER TABLE "Board" ADD COLUMN "showOnSites" BOOLEAN NOT NULL DEFAULT false;

-- The client's running-jobs board, brought in from Trello under this name,
-- gets the tick when it is there; otherwise no board has it and Baustellen
-- says so, with the way to the board settings.
UPDATE "Board" SET "showOnSites" = true
WHERE "id" = (
  SELECT "id" FROM "Board"
  WHERE lower(btrim("name")) = 'aktuell laufende baustellen'
  ORDER BY "sortOrder", "createdAt"
  LIMIT 1
);
