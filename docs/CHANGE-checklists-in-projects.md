# Change: checklists live next to the project templates

**Release 1.18.0** · reversible, see "Rollback" below.

## What changed

1. **The checklists moved out of the settings** into the project area:
   `Projekte → Checklisten` (`/projects/checklists`) with a list page, a create
   page and an edit page — the same shape as the project templates. Settings →
   *Arbeitsbereiche* only carries a link there now.
2. **A project can be given checklists in its own form** (create and edit).
   Every selected checklist is *copied* into the project on save.
3. **A project template can carry checklists.** Every project made from that
   template starts with those lists (new table `TemplateChecklist`).

Copies stay copies: editing a checklist later never changes lists that are
already on a project. Taking a list out of the project form deletes it only
while no point has been ticked; once the crew has ticked something, the list
stays on the project.

## Touched files

| File | What |
| --- | --- |
| `prisma/schema.prisma` | new model `TemplateChecklist`; relations on `ProjectTemplate` and `ChecklistTemplate` |
| `prisma/migrations/20260824090000_template_checklists/migration.sql` | creates the join table |
| `src/lib/project-checklists.ts` | new — `planChecklistChanges` (add / remove / kept) |
| `tests/unit/project-checklists.test.ts` | new — four cases for that planner |
| `src/app/(admin)/projects/checklists/page.tsx` | new — list |
| `src/app/(admin)/projects/checklists/new/page.tsx` | new — create |
| `src/app/(admin)/projects/checklists/[id]/page.tsx` | new — edit + delete |
| `src/app/(admin)/projects/checklists/checklist-form.tsx` | new — the form |
| `src/app/(admin)/projects/checklists/actions.ts` | new — create / update / delete (management, audited) |
| `src/app/(admin)/settings/page.tsx` | checklist editor replaced by a link |
| `src/app/(admin)/settings/actions.ts` | old `*ChecklistTemplate` actions removed |
| `src/app/(admin)/settings/checklist-templates.tsx` | deleted |
| `src/app/(admin)/projects/page.tsx` | "Checklisten" button next to "Vorlagen" |
| `src/app/(admin)/projects/project-form.tsx` | `checklists` prop, `checklistIds` state and picker |
| `src/app/(admin)/projects/new/page.tsx`, `[id]/edit/page.tsx` | load the active checklists, prefill the selection |
| `src/app/(admin)/projects/actions.ts` | `checklistIds` in the schema; `copyChecklistsToProject`, `syncProjectChecklists` |
| `src/app/(admin)/projects/templates/template-form.tsx` | checklist picker |
| `src/app/(admin)/projects/templates/actions.ts` | `checklistIds` written to `TemplateChecklist` |
| `src/app/(admin)/projects/templates/new/page.tsx`, `[id]/page.tsx` | load and prefill the checklists |
| `messages/de.json`, `messages/en.json` | new keys under `checklists` |
| `docs/BENUTZERHANDBUCH.md` | chapter 12 now covers checklists |

## Rollback

1. `git revert` the release commit (or check out the files above from the tag
   before it).
2. The join table can stay — nothing else reads it. To drop it as well:
   `DROP TABLE "TemplateChecklist";` and remove the model plus its two
   relation fields from `prisma/schema.prisma`, then `npx prisma generate`.
3. Checklists already copied onto projects are untouched by all of this; they
   belong to the project, not to the template.
