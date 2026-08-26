-- Machines and devices: one row per physical unit, handed out to a site or to
-- an employee and taken back. Availability is computed from the open handout,
-- so a later sync with an outside system only has to fill the same tables.
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inventoryNo" TEXT,
    "category" TEXT,
    "storageLocation" TEXT,
    "notes" TEXT,
    "videoUrl" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalSystem" TEXT,
    "externalId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Device_active_idx" ON "Device"("active");
CREATE UNIQUE INDEX "Device_externalSystem_externalId_key" ON "Device"("externalSystem", "externalId");

CREATE TABLE "DeviceAssignment" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "projectId" TEXT,
    "employeeId" TEXT,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    CONSTRAINT "DeviceAssignment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DeviceAssignment_deviceId_returnedAt_idx" ON "DeviceAssignment"("deviceId", "returnedAt");
CREATE INDEX "DeviceAssignment_projectId_idx" ON "DeviceAssignment"("projectId");
CREATE INDEX "DeviceAssignment_employeeId_idx" ON "DeviceAssignment"("employeeId");
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeviceAssignment" ADD CONSTRAINT "DeviceAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
