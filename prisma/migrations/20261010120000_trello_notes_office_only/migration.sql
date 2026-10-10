-- The 1.49.0 Trello importer wrote a card's comments as plain team notes
-- (nobody as author, the Trello author in a footer). The importer since
-- writes them office-only, as sales talk and prices were in Trello, and
-- tells an old comment from a new one by its moment — so a re-import
-- neither doubles nor fixes these. This does, once: every authorless team
-- note on a project that has a Trello link. A note written by hand in the
-- app always has its author.
UPDATE "Note" n
SET "visibility" = 'MANAGEMENT'
WHERE n."authorId" IS NULL
  AND n."visibility" = 'TEAM'
  AND EXISTS (SELECT 1 FROM "ProjectLink" l WHERE l."projectId" = n."projectId" AND l."system" = 'trello');
