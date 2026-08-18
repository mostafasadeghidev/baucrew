# Change: client type, building type and item kind are configurable

*Released with 1.9.0 (2026-08-19).*

## What changed

The three fixed enumerations became **editable lists** in Settings →
Arbeitsbereiche:

| List | Default entries | Where it is used |
| --- | --- | --- |
| `clientTypes` | Privat, Gewerblich | project form, project page, work order |
| `buildingTypes` | Neubau, Altbau / Sanierung | project form, project page, work order |
| `itemKinds` | Werkzeug, Material | warehouse list/filter/form, quick-create, work order |

- Postgres enums `ClientType`, `BuildingType`, `ItemKind` were **replaced by
  text columns** (`Project.clientType`, `Project.buildingType`,
  `CatalogItem.kind`). Existing values are unchanged.
- The lists live in `AppSetting` (`clientTypes`, `buildingTypes`, `itemKinds`)
  as JSON `{ value, labelDe, labelEn }[]`; built-in entries can be renamed but
  not deleted, so old records keep a readable label.
- Suggested extras (Öffentlich · Sanierung, Brücke, Straße · Warnschild,
  Absperrband) are one click away in Settings.
- Work order: items of kind `TOOL` print in the left column, every other kind
  on the right.

## Touched files

`prisma/schema.prisma`, `prisma/migrations/20260819100000_configurable_types/`,
`src/lib/option-lists.ts`, `src/lib/option-lists-db.ts`,
`src/app/(admin)/settings/option-list-manager.tsx`, `settings/page.tsx`,
`settings/actions.ts`, `projects/actions.ts`, `projects/project-form.tsx`,
`projects/new/page.tsx`, `projects/[id]/page.tsx`, `projects/[id]/edit/page.tsx`,
`warehouse/*`, `src/components/quick-item-modal.tsx`,
`src/app/projects/[id]/sheet/page.tsx`.

## Rollback

1. Revert the code changes.
2. Recreate the enums and cast back (values that were added afterwards must be
   cleared first):

```sql
UPDATE "Project" SET "clientType" = NULL WHERE "clientType" NOT IN ('PRIVAT','GEWERBLICH');
UPDATE "Project" SET "buildingType" = NULL WHERE "buildingType" NOT IN ('NEUBAU','ALTBAU_SANIERUNG');
UPDATE "CatalogItem" SET "kind" = 'MATERIAL' WHERE "kind" NOT IN ('TOOL','MATERIAL');
CREATE TYPE "ClientType" AS ENUM ('PRIVAT','GEWERBLICH');
CREATE TYPE "BuildingType" AS ENUM ('NEUBAU','ALTBAU_SANIERUNG');
CREATE TYPE "ItemKind" AS ENUM ('TOOL','MATERIAL');
ALTER TABLE "Project" ALTER COLUMN "clientType" TYPE "ClientType" USING "clientType"::"ClientType";
ALTER TABLE "Project" ALTER COLUMN "buildingType" TYPE "BuildingType" USING "buildingType"::"BuildingType";
ALTER TABLE "CatalogItem" ALTER COLUMN "kind" TYPE "ItemKind" USING "kind"::"ItemKind";
DELETE FROM "AppSetting" WHERE key IN ('clientTypes','buildingTypes','itemKinds');
```

3. `npx prisma migrate resolve --rolled-back 20260819100000_configurable_types`
