-- Client type, building type and item kind become configurable lists
-- (values stay the same, the enums are replaced by text columns).
ALTER TABLE "Project" ALTER COLUMN "clientType" TYPE TEXT USING "clientType"::text;
ALTER TABLE "Project" ALTER COLUMN "buildingType" TYPE TEXT USING "buildingType"::text;
ALTER TABLE "CatalogItem" ALTER COLUMN "kind" TYPE TEXT USING "kind"::text;

DROP TYPE IF EXISTS "ClientType";
DROP TYPE IF EXISTS "BuildingType";
DROP TYPE IF EXISTS "ItemKind";
