-- The client's own project number as a field of its own. Until now the import
-- kept it only as the project's external id (the Trello title's "(2183637)"),
-- where it was shown but could be neither typed in nor changed.
ALTER TABLE "Project" ADD COLUMN "jobNumber" TEXT;
CREATE UNIQUE INDEX "Project_jobNumber_key" ON "Project"("jobNumber");

-- Copy the numbers the import already holds. A number that stands on two
-- projects is copied to neither — which one it belongs to is a person's call;
-- the unique index would refuse the second anyway.
UPDATE "Project" p
SET "jobNumber" = p."externalId"
WHERE p."externalSystem" = 'trello'
  AND p."externalId" ~ '^[0-9]{5,9}$'
  AND NOT EXISTS (
    SELECT 1 FROM "Project" q
    WHERE q."id" <> p."id" AND q."externalSystem" = 'trello' AND q."externalId" = p."externalId"
  );
