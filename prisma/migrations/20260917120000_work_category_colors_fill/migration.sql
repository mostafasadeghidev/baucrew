-- Every trade gets a label colour of its own, in the order the trades stand:
-- ten trades are ten colours before any repeats. A colour already chosen stays.
WITH ordered AS (
  SELECT "id", ((row_number() OVER (ORDER BY "sortOrder", "nameDe") - 1) % 10)::int AS n
  FROM "WorkCategory"
)
UPDATE "WorkCategory" w
SET "color" = (ARRAY['sky', 'emerald', 'amber', 'rose', 'violet', 'teal', 'orange', 'indigo', 'lime', 'pink'])[o.n + 1]
FROM ordered o
WHERE o."id" = w."id" AND w."color" IS NULL;
