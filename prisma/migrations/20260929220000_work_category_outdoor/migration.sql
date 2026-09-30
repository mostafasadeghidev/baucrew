-- A trade done outside: its jobs are warned of rain. A tick of its own, so
-- the warnings no longer hang on three names that a rename switched off.
ALTER TABLE "WorkCategory" ADD COLUMN "outdoor" BOOLEAN NOT NULL DEFAULT false;

-- The three trades of the base data the warnings went by until now keep them
-- (known by their names in prisma/seed-data.json).
UPDATE "WorkCategory" SET "outdoor" = true
WHERE "nameEn" IN ('Exterior facade', 'ETICS insulation', 'Scaffolding') OR "nameDe" IN ('WDVS', 'Gerüstbau');
