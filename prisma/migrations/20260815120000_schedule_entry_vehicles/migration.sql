-- Multi-vehicle schedule entries: move ScheduleEntry.vehicleId into a join table.

CREATE TABLE "ScheduleEntryVehicle" (
    "scheduleEntryId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    CONSTRAINT "ScheduleEntryVehicle_pkey" PRIMARY KEY ("scheduleEntryId","vehicleId")
);

CREATE INDEX "ScheduleEntryVehicle_vehicleId_idx" ON "ScheduleEntryVehicle"("vehicleId");

ALTER TABLE "ScheduleEntryVehicle"
  ADD CONSTRAINT "ScheduleEntryVehicle_scheduleEntryId_fkey"
  FOREIGN KEY ("scheduleEntryId") REFERENCES "ScheduleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduleEntryVehicle"
  ADD CONSTRAINT "ScheduleEntryVehicle_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing assignments
INSERT INTO "ScheduleEntryVehicle" ("scheduleEntryId", "vehicleId")
SELECT "id", "vehicleId" FROM "ScheduleEntry" WHERE "vehicleId" IS NOT NULL;

ALTER TABLE "ScheduleEntry" DROP CONSTRAINT "ScheduleEntry_vehicleId_fkey";
ALTER TABLE "ScheduleEntry" DROP COLUMN "vehicleId";
