-- Trades that are no work on a site — the office's own marketing and
-- organisation, "Lead Anzeige", "Kundengewinnung (SM)", "Mitarbeitergewinnung",
-- "Systematisierung", "Beispiele/Inspirationen" — stay on their projects but
-- no longer name them (NOT_WORK in src/lib/project-title.ts, the same
-- pattern). The projects that carry one, or a work note that says one, are
-- named again the way src/lib/project-title.ts names them: the customer, the
-- other trades, the work note — or the old title where nothing is left.
-- Nothing is sent to Wattro. Rollback: docs/CHANGE-project-title-from-customer.md.
WITH "affected" AS (
  SELECT w."projectId" AS "id"
  FROM "ProjectWorkCategory" w
  JOIN "WorkCategory" wc ON wc."id" = w."workCategoryId"
  WHERE wc."nameDe" ~* 'lead|anzeige|gewinnung|systematisier|beispiel|inspiration'
  UNION
  SELECT "id" FROM "Project" WHERE "workNote" ~* 'lead|anzeige|gewinnung|systematisier|beispiel|inspiration'
),
"parts" AS (
  SELECT p."id",
    (
      SELECT STRING_AGG(TRIM(wc."nameDe"), ', ' ORDER BY wc."sortOrder", wc."nameDe")
      FROM "ProjectWorkCategory" w
      JOIN "WorkCategory" wc ON wc."id" = w."workCategoryId"
      WHERE w."projectId" = p."id" AND TRIM(wc."nameDe") <> ''
        AND wc."nameDe" !~* 'lead|anzeige|gewinnung|systematisier|beispiel|inspiration'
    ) AS "trades",
    NULLIF(REGEXP_REPLACE(TRIM(COALESCE(p."workNote", '')), '\s+', ' ', 'g'), '') AS "note"
  FROM "Project" p
  WHERE p."id" IN (SELECT "id" FROM "affected")
),
"work" AS (
  SELECT x."id",
    NULLIF(CONCAT_WS(', ', x."trades",
      CASE
        WHEN x."note" ~* 'lead|anzeige|gewinnung|systematisier|beispiel|inspiration' THEN NULL
        -- a note that repeats a trade's name is said once
        WHEN x."note" = ANY (STRING_TO_ARRAY(x."trades", ', ')) THEN NULL
        ELSE x."note"
      END), '') AS "work"
  FROM "parts" x
)
UPDATE "Project" p
SET "name" = LEFT(COALESCE(
  CASE WHEN w."work" IS NOT NULL THEN CONCAT_WS(' · ', NULLIF(TRIM(c."name"), ''), w."work") END,
  NULLIF(TRIM(p."sourceTitle"), ''),
  TRIM(c."name")
), 300)
FROM "work" w, "Customer" c
WHERE w."id" = p."id" AND c."id" = p."customerId";
