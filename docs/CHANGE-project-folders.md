# CHANGE: Project folders — attachments and documentation sorted into one folder tree

Builds on `docs/CHANGE-project-documentation.md` (same branch).

## What changed

Every project gets a folder tree for its files: the card's attachments
(`Document`, the crew's "Baustellenfotos" among them) and the documentation
entries (photos, PDFs, notes, voice notes). One tree for both.

1. **The folder bar** (`src/components/project-folders.tsx`, `FolderBar`)
   stands above "Anhänge" on the card and the project page, and above
   "Baustellenfotos" on `/my` (big targets there). It shows a breadcrumb from
   the main folder ("Hauptordner") down to the open folder, the folders inside
   it as tiles with how much each holds (subfolders included, only what the
   reader can see), "+ Ordner", and a "…" on the open folder to rename or
   delete it.
2. **The lists under it** — the attachments, the documentation, the crew's
   site photos — show what lies in the open folder. A file added while a
   folder is open goes into it: "Hinzufügen" on Anhänge, a file dropped on the
   card, a site photo, every way of adding documentation. Which folder is open
   is kept in the page (one shared store per project, not the address) and is
   back at the main folder the next time the card opens.
3. **Moving.** On the desktop a file or an entry is dragged onto a folder
   tile or a step of the breadcrumb. Everywhere — and the only way on a phone —
   "Verschieben nach …" in the item's menu opens the folder tree to pick from
   (a sheet from the bottom on a phone). The crew's site photos have a small
   move button on the tile. A documentation entry moves as a whole (several
   photos of one entry stay together).
4. **Renaming files.** Attachments could already be renamed. Documentation
   entries with one file — a PDF, a voice note, a single photo — now have
   "Umbenennen"; the ending is kept when the new name leaves it off
   (`renamedFile`). Voice notes show their file name under the player.
5. **Deleting a folder** asks first and says where things go: "Was darin liegt
   (n Dateien) und alle Unterordner wandern nach „…“. Keine Datei wird
   gelöscht." The folder's files, entries and subfolders move one level up;
   a subfolder whose name is taken there becomes "Name (2)".
6. **Starting point.** Existing files are not touched: they stay in the main
   folder, and a project starts with no folders. While it has none, the bar
   offers one click to create "Fotos, Pläne, Angebote, Dokumentation". No
   folders are created automatically, so the many imported projects do not
   fill up with empty folders.

Rules (`src/lib/folders.ts`, tested in `tests/unit/folders.test.ts`):

- **Create folders, move files**: whoever may work on the project
  (`canWorkOn`). The crew moves only what it can see — the documentation and
  the attachments shown to the crew (`visibleToCrew`); the server ignores the
  rest.
- **Rename or delete a folder**: the office (ADMIN, MANAGER) any, everybody
  else only the folders they created (`canChangeFolder`).
- Names: one line, at most 80 characters, no `/` or `\`, unique among the
  folder's siblings regardless of capitals. Folders nest at most 4 deep.

Also fixed on this branch: **merging two projects** (`mergeProjects` in
`src/app/(admin)/projects/actions.ts`) now moves the dropped project's
folders and documentation entries to the kept one. Before, the documentation
would have been deleted with the dropped project.

## Data

Migration `prisma/migrations/20261031130100_project_folders`:

- New table `ProjectFolder` (project, `parentId` → itself for nesting, name,
  creator, `createdAt`). The parent reference is `ON DELETE NO ACTION`: the
  app moves a folder's children out before deleting it; deleting a project
  removes all its folders at once.
- `Document.folderId` and `DocumentationEntry.folderId`, both optional,
  `ON DELETE SET NULL`. Null = the main folder, so every existing file stays
  where it was shown before.

The backup carries `ProjectFolder` (before the documents), each parent
before its subfolders (`parentsFirst` in `src/lib/backup.ts`).

## Files

New: `src/lib/folders.ts`, `src/lib/folders-db.ts`, `src/app/folder-actions.ts`,
`src/components/project-folders.tsx`, `tests/unit/folders.test.ts`, the migration.

Changed:

- `prisma/schema.prisma` — `ProjectFolder`, `folderId` on `Document` and
  `DocumentationEntry`, relations on `Project` and `User`.
- `src/app/(admin)/projects/[id]/project-detail.tsx` — folders loaded, the bar
  above the attachments (both branches), `folderId` on the file rows.
- `src/app/(admin)/projects/[id]/files-card.tsx`, `attachment-list.tsx` —
  filtered by the open folder, rows draggable, "Verschieben nach …".
- `src/app/(admin)/projects/[id]/attach-panel.tsx`, `card-drop-zone.tsx`,
  `upload-files.ts`, `src/lib/photo-upload.ts`,
  `src/app/api/projects/[id]/files/route.ts` — a new file goes into the open folder.
- `src/components/project-documentation.tsx`, `src/lib/documentation-db.ts`,
  `src/app/documentation-actions.ts` (`renameDocFile`, folder on new notes),
  `src/app/api/projects/[id]/documentation/route.ts` — the same for documentation.
- `src/components/site-photos.tsx`, `src/app/my/page.tsx` — the crew's view.
- `src/app/(admin)/projects/actions.ts` — the merge.
- `src/lib/backup-tables.ts`, `src/lib/backup.ts`,
  `tests/unit/backup-tables.test.ts` (a table pointing at itself).
- `messages/de.json`, `messages/en.json` — namespace `folders`, and
  `files.moveTo`, `files.noneInFolder`, `documentation.moveTo`,
  `documentation.noneInFolder`, `documentation.renameFile`.

## Rollback

1. Revert the commit. Without the bar every list shows all its files again —
   the folder columns are simply not read.
2. Data (on a copy first; files are never touched by folders):

   ```sql
   ALTER TABLE "Document" DROP COLUMN "folderId";
   ALTER TABLE "DocumentationEntry" DROP COLUMN "folderId";
   DROP TABLE "ProjectFolder";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031130100_project_folders';
   ```

   Rolling back the documentation as well: do this first, then the steps in
   `docs/CHANGE-project-documentation.md`.
