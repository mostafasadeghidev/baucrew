-- A project's name is no longer typed: it is the customer followed by the
-- project's trades, "Muster GmbH · Malern" (src/lib/project-title.ts). The
-- name each project had until now is kept as its sourceTitle — the Trello
-- card's title, the words typed in — and stays the name while there is no
-- trade. Rollback: docs/CHANGE-project-title-from-customer.md.
ALTER TABLE "Project" ADD COLUMN "sourceTitle" TEXT;

UPDATE "Project" SET "sourceTitle" = "name";

-- The same words src/lib/project-title.ts puts together: the trades by their
-- German name in the order Settings lists them, after the customer's name.
UPDATE "Project" p
SET "name" = LEFT(CONCAT_WS(' · ', NULLIF(TRIM(c."name"), ''), t."trades"), 300)
FROM "Customer" c,
  (
    SELECT w."projectId", STRING_AGG(TRIM(wc."nameDe"), ', ' ORDER BY wc."sortOrder", wc."nameDe") AS "trades"
    FROM "ProjectWorkCategory" w
    JOIN "WorkCategory" wc ON wc."id" = w."workCategoryId"
    WHERE TRIM(wc."nameDe") <> ''
    GROUP BY w."projectId"
  ) t
WHERE c."id" = p."customerId" AND t."projectId" = p."id";
