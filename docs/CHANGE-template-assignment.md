# Change: templates carry an optional default assignment

*Released with 1.8.0 (2026-08-19).*

## What changed

A project template can now store a **site manager, vehicles and crew** — all
optional. Creating a project from the template prefills those fields (they can
be changed before saving).

- `ProjectTemplate.managerId` (nullable, `SET NULL` on employee delete).
- New tables **`TemplateVehicle`** and **`TemplateEmployee`** (composite keys).
- Template form: new "Zuordnung" card; new project prefills manager, vehicles
  and team from the chosen template.
- Backup/restore export and import the two new tables.

## Touched files

`prisma/schema.prisma`, `prisma/migrations/20260818140000_template_assignment/`,
`src/app/(admin)/projects/templates/actions.ts`, `template-form.tsx`,
`templates/new/page.tsx`, `templates/[id]/page.tsx`,
`src/app/(admin)/projects/new/page.tsx`,
`src/app/(admin)/settings/backup/route.ts`, `settings/actions.ts`.

## Rollback

1. Revert the code changes (`git revert` of the release commit).
2. Drop the additions:

```sql
DROP TABLE "TemplateVehicle";
DROP TABLE "TemplateEmployee";
ALTER TABLE "ProjectTemplate" DROP CONSTRAINT IF EXISTS "ProjectTemplate_managerId_fkey";
ALTER TABLE "ProjectTemplate" DROP COLUMN "managerId";
```

3. `npx prisma migrate resolve --rolled-back 20260818140000_template_assignment`

Nothing else references these fields, so no project data is lost.
