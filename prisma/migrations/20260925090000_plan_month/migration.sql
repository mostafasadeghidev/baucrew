-- The month a job is expected in, and how many months it runs: the two
-- planning fields the Planumsatz files a project under (src/lib/plan-month.ts).
ALTER TABLE "Project" ADD COLUMN "planMonth" DATE;
ALTER TABLE "Project" ADD COLUMN "planMonths" INTEGER NOT NULL DEFAULT 1;

-- A project tied to lines of the planning sheet stood in the sheet's months:
-- it keeps that place — the earliest line's month, and the run of months to
-- its latest — so the months read as before where nobody has moved a job.
WITH spans AS (
  SELECT "projectId",
         MIN(make_date("year", "month", 1)) AS first_month,
         MAX(make_date("year", "month", 1)) AS last_month
  FROM "PlanEntry"
  WHERE "projectId" IS NOT NULL AND "month" IS NOT NULL
  GROUP BY "projectId"
)
UPDATE "Project" p
SET "planMonth" = s.first_month,
    "planMonths" = LEAST(
      24,
      GREATEST(
        1,
        ((EXTRACT(YEAR FROM s.last_month) - EXTRACT(YEAR FROM s.first_month)) * 12
          + EXTRACT(MONTH FROM s.last_month) - EXTRACT(MONTH FROM s.first_month) + 1)::int
      )
    )
FROM spans s
WHERE s."projectId" = p.id;
