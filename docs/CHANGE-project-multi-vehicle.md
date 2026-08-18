# Change: a project can have several vehicles

*Released with 1.6.0 (2026-08-18).*

## What changed

Until now a project pointed at **one** vehicle (`Project.vehicleId`). Assignments
in the schedule already allowed several vehicles; the project record now works
the same way, so the vehicle list of a project is a real list and prefills every
new assignment.

- New table **`ProjectVehicle`** (`projectId`, `vehicleId`, `createdAt`,
  primary key on both columns, index on `vehicleId`).
- Column **`Project.vehicleId` was dropped**; existing values were copied into
  `ProjectVehicle` by the migration.
- Project form: the vehicle field is a **multi-select** (chips), like the
  assignment dialog.

## Touched files

| File | Change |
| --- | --- |
| `prisma/schema.prisma` | `Project.vehicles ProjectVehicle[]`, new `ProjectVehicle` model, `Vehicle.projects` now `ProjectVehicle[]` |
| `prisma/migrations/20260818090000_project_multi_vehicle/migration.sql` | creates the table, copies the data, drops the column |
| `src/app/(admin)/projects/actions.ts` | `vehicleId` → `vehicleIds[]` (create + update via nested `vehicles`) |
| `src/app/(admin)/projects/project-form.tsx` | `MultiCombobox` + hidden `vehicleIds` inputs |
| `src/app/(admin)/projects/new/page.tsx`, `[id]/edit/page.tsx` | initial values `vehicleIds` |
| `src/app/(admin)/projects/[id]/page.tsx` | shows all vehicles |
| `src/app/projects/[id]/sheet/page.tsx` | work order lists all vehicles |
| `src/app/(admin)/schedule/actions.ts` | assignment defaults use every project vehicle |
| `src/app/(admin)/dashboard/page.tsx` | "no vehicle assigned" check uses `vehicles: { none: {} }` |
| `src/app/(admin)/vehicles/[id]/page.tsx`, `actions.ts` | project list/count through the join table |
| `src/app/(admin)/settings/backup/route.ts`, `settings/actions.ts` | backup/restore include `projectVehicles` |
| `tests/db/project-vehicles.test.ts` | DB-backed guard for the relation |

## Rollback

1. Revert the code changes (`git revert` of the release commit).
2. Restore the single column and the first vehicle per project:

```sql
ALTER TABLE "Project" ADD COLUMN "vehicleId" TEXT;
UPDATE "Project" p SET "vehicleId" = (
  SELECT pv."vehicleId" FROM "ProjectVehicle" pv
  WHERE pv."projectId" = p.id ORDER BY pv."createdAt" LIMIT 1
);
ALTER TABLE "Project" ADD CONSTRAINT "Project_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
DROP TABLE "ProjectVehicle";
```

3. Remove the migration folder `20260818090000_project_multi_vehicle` and mark
   it as rolled back (`npx prisma migrate resolve --rolled-back 20260818090000_project_multi_vehicle`).

> Note: projects with more than one vehicle keep only the oldest entry after a
> rollback — export a backup (Einstellungen → Datensicherung) first.
