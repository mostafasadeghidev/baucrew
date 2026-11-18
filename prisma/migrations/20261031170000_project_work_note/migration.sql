-- The type of work in the office's own words, where no trade says it: what
-- the Trello field "Art der Arbeit" named that matched no trade, or what the
-- office types in. It follows the trades in the project's name
-- (src/lib/project-title.ts). Rollback: docs/CHANGE-project-title-from-customer.md.
ALTER TABLE "Project" ADD COLUMN "workNote" TEXT;

-- A job the client does again and again and had no trade for: the seamless
-- bathroom. Indoors, after the trades there are; left alone where it exists.
-- An empty database gets it from the seed (prisma/seed-data.json), in its place.
INSERT INTO "WorkCategory" ("id", "nameDe", "nameEn", "active", "sortOrder", "outdoor")
SELECT 'work-category-fugenloses-bad', 'Fugenloses Bad', 'Seamless bathroom', true, MAX("sortOrder") + 1, false
FROM "WorkCategory"
HAVING COUNT(*) > 0 AND NOT EXISTS (SELECT 1 FROM "WorkCategory" WHERE LOWER(TRIM("nameDe")) = 'fugenloses bad');
