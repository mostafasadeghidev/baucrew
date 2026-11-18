# CHANGE: Photos on a project's tasks (Aufgaben)

Builds on `docs/CHANGE-project-documentation.md` and
`docs/CHANGE-project-folders.md` (same branch).

## What changed

Every task of a project (`ProjectTask`, "Aufgaben" on the card, the project
page and the crew's `/my`) can carry photos — taken by the crew as proof it
is done, or of what stands in its way.

1. **Adding.** Under each task a "Foto" button. On a phone it opens a small
   menu: "Foto aufnehmen" (the camera) or "Aus Galerie" (several at once); at
   a desk it opens the file picker. Photos are drawn smaller before they leave
   the device, sent one by one with a counter ("Wird gesendet … 1/3"). Works
   on open and on ticked-off tasks.
2. **Showing.** Thumbnails under the task; a tap opens the lightbox (arrows,
   keys, swipe), the same one as the documentation's photos.
3. **Deleting.** A bin in the lightbox, after a question. The office and the
   site manager may delete any task photo, the crew the photos it took
   itself (`canDeleteTaskPhoto` in `src/lib/tasks.ts`), always on a project
   the user may work on (`canWorkOn`).
4. **In the folder tree.** A task photo is a project file like a defect's
   photo: a `Document` with `taskId`, visible to the crew. It is filed into a
   top-level folder **"Aufgaben"**, made the first time a task gets a photo
   (an existing top-level folder of that name is reused). So the photos show
   up in the attachments ("· Aufgabe" in the line) and among the crew's site
   photos inside that folder — not loose in the main folder — and can be
   moved like any file without losing their task.
5. A deleted task leaves its photos on the project (as a deleted defect does).

Reused, not copied: the camera/gallery picker is now one hook
(`usePhotoPicker`, `src/components/photo-picker.tsx`) and the lightbox one
component (`PhotoGallery`, `src/components/photo-gallery.tsx`); the
documentation section uses both too. Upload, shrinking and storage are the
project files' own (`POST /api/projects/<id>/files` with `taskId`,
`uploadTaskPhoto` in `src/lib/photo-upload.ts`).

## Data

Migration `prisma/migrations/20261031130200_task_photos`: `Document.taskId`
(optional, `ON DELETE SET NULL`, indexed). Already in the backup with the
documents.

## Files

New: `src/components/photo-picker.tsx`, `src/components/photo-gallery.tsx`,
the migration.

Changed:

- `prisma/schema.prisma` — `Document.taskId`, `ProjectTask.photos`.
- `src/app/api/projects/[id]/files/route.ts` — `taskId` checked against the
  project, pictures only, crew-visible, into "Aufgaben".
- `src/lib/folders-db.ts` — `rootFolderNamed`.
- `src/lib/photo-upload.ts` — `uploadTaskPhoto`, one shared sender.
- `src/lib/tasks.ts`, `src/lib/tasks-db.ts` — the rule, photos on the rows.
- `src/app/task-actions.ts` — `deleteTaskPhoto`.
- `src/components/project-tasks.tsx` — `TaskPhotos` under each task.
- `src/components/project-documentation.tsx` — uses the shared picker and lightbox.
- `src/app/(admin)/projects/[id]/files-card.tsx`, `project-detail.tsx` — "Aufgabe" on the line.
- `messages/de.json`, `messages/en.json` — namespace `photos` (the lightbox,
  moved from `documentation`), `tasks.photo*`, `files.ofTask`.
- `tests/unit/tasks.test.ts`.

## Rollback

1. Revert the commit. The photos stay as ordinary project files (in
   "Aufgaben"); nothing is lost.
2. Data, on a copy first:

   ```sql
   ALTER TABLE "Document" DROP COLUMN "taskId";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031130200_task_photos';
   ```

   Roll this back before the folders and the documentation if those go too.
