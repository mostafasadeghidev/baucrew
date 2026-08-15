-- Geo coordinates for customers and projects (chosen from the city picker;
-- used for weather lookups without repeated geocoding).
ALTER TABLE "Customer" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Project" ADD COLUMN "latitude" DOUBLE PRECISION, ADD COLUMN "longitude" DOUBLE PRECISION;
