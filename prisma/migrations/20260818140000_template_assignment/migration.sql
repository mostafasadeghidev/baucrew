-- Templates can carry a default site manager, vehicles and crew (all optional).
ALTER TABLE "ProjectTemplate" ADD COLUMN "managerId" TEXT;

ALTER TABLE "ProjectTemplate" ADD CONSTRAINT "ProjectTemplate_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "TemplateVehicle" (
    "templateId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    CONSTRAINT "TemplateVehicle_pkey" PRIMARY KEY ("templateId","vehicleId")
);
CREATE INDEX "TemplateVehicle_vehicleId_idx" ON "TemplateVehicle"("vehicleId");
ALTER TABLE "TemplateVehicle" ADD CONSTRAINT "TemplateVehicle_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateVehicle" ADD CONSTRAINT "TemplateVehicle_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "TemplateEmployee" (
    "templateId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "TemplateEmployee_pkey" PRIMARY KEY ("templateId","employeeId")
);
CREATE INDEX "TemplateEmployee_employeeId_idx" ON "TemplateEmployee"("employeeId");
ALTER TABLE "TemplateEmployee" ADD CONSTRAINT "TemplateEmployee_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ProjectTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TemplateEmployee" ADD CONSTRAINT "TemplateEmployee_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
