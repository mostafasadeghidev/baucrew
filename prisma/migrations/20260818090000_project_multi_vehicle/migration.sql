-- Projects can have several vehicles (like schedule entries).
CREATE TABLE "ProjectVehicle" (
    "projectId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVehicle_pkey" PRIMARY KEY ("projectId","vehicleId")
);

CREATE INDEX "ProjectVehicle_vehicleId_idx" ON "ProjectVehicle"("vehicleId");

ALTER TABLE "ProjectVehicle" ADD CONSTRAINT "ProjectVehicle_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVehicle" ADD CONSTRAINT "ProjectVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry the single vehicle of each project over.
INSERT INTO "ProjectVehicle" ("projectId", "vehicleId")
SELECT "id", "vehicleId" FROM "Project" WHERE "vehicleId" IS NOT NULL;

ALTER TABLE "Project" DROP CONSTRAINT IF EXISTS "Project_vehicleId_fkey";
ALTER TABLE "Project" DROP COLUMN "vehicleId";
