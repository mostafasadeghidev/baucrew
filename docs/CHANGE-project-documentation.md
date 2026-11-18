# CHANGE: Project documentation — photos, PDFs, notes and voice notes in a section of their own

## What changed

A project gets a **Dokumentation** section: what the site and the office
record about the job, apart from the card's attachments and comments. Four
kinds of entry, newest first, each with who made it and when:

- **Fotos** — taken with the camera ("Foto aufnehmen", phones only: a file
  input with `capture="environment"`) or picked from the gallery, up to 20 at
  once. Drawn smaller in the browser before they leave (`downscaleImage` from
  `src/lib/photo-upload.ts`, long edge 2000 px). Shown as tiles; a tap opens a
  lightbox that steps through the entry's photos (arrows, keys, swipe).
- **PDF** — one per entry, opened in the same viewer as the attachments
  (`FilePreview`, which gained an optional `href`).
- **Notiz** — a written note.
- **Sprachnotiz** — recorded in the browser (MediaRecorder; webm/opus where the
  browser offers it, mp4 on Safari that knows nothing else), heard back, then
  sent. At most 10 minutes. The server writes it out through OpenAI before it
  answers, so the phone shows the words at once; the audio stays playable.
  The transcript can be corrected. When the service fails, the recording is
  kept and "Verschriftlichen" tries again. Without `OPENAI_API_KEY` the note
  is saved with "Verschriftlichung ist nicht eingerichtet."

Where it is:

1. **The card's "+ Hinzufügen"** has a seventh item, **Dokumentation**
   (`card-popovers.tsx`): it scrolls to the section and opens its menu.
2. **The card and the full project page** show the section right under
   "Anhänge" (`project-detail.tsx`, one `{documentation}` in each branch).
3. **The crew's phone (`/my`)** shows it for each job of the day, with the five
   ways to add as big buttons instead of a menu (`large`).

Who may do what (the rules in `src/lib/documentation.ts`, tested):

- **Read and add**: whoever may work on the project — `canWorkOn` in
  `src/lib/crew-access.ts`: the office on every project, a site manager on the
  ones they are named on, the crew on the jobs the phone offers them. The crew
  may add every kind, PDFs included. Everyone who can open the project sees
  all of its documentation; nothing in it carries a price.
- **Correct the words** (note, transcript): the author and the office
  (ADMIN, MANAGER).
- **Delete**: the author and the office. The entry's files go from the disk too.

Privacy: **a voice note's recording is sent to OpenAI** to be written out —
the same key and the same company as the in-app assistant
(`docs/CHANGE-mcp-ai-chat.md`). The recorder says so in one line before
anything is sent ("Die Aufnahme wird zur Verschriftlichung an OpenAI
gesendet."). Photos, PDFs and notes stay on the server. Nothing is sent
without a key.

Folders for the documentation and the attachments came right after, on the
same branch: `docs/CHANGE-project-folders.md`. That change also makes a
project merge move the documentation to the kept project.

## Data

Two new tables and two enums — migration
`prisma/migrations/20261031130000_project_documentation`:

- `DocumentationEntry` (project, kind `TEXT|IMAGE|PDF|VOICE`, `text` = the
  note or the transcript, `transcription` `PENDING|DONE|FAILED|OFF` for voice
  notes, author, `createdAt`, `editedAt`).
- `DocumentationFile` (entry, filename, type, size, `path` in `storage/`,
  `durationMs` for a recording, `sortOrder`).

Not `Document`: a documentation photo would otherwise show up among the
attachments, in the cover picker, in the crew's "Baustellenfotos", in the API's
file list and in the board's paperclip count, and every one of those queries
would need a filter. The files live in the same `storage/` as the documents,
under `<projectId>/doku/`. Both tables are in the backup
(`src/lib/backup-tables.ts`), and their files in the backup's `files`
(`src/lib/backup.ts`).

## Limits and checks (on the server)

`POST /api/projects/<id>/documentation` (multipart: `kind`, `file` once or
more, `durationMs`) checks `canWorkOn`, the kind, the number of files (20
photos, 1 PDF, 1 recording), each file's type by what the kind accepts (the
browser's type, or the name's for a file without one) and its size: photos
15 MB, PDF 25 MB, recordings 20 MB (OpenAI takes 25 MB).

`GET /api/documentation/files/<id>` serves a file to whoever may read the
project; PDFs, pictures and recordings inline, anything else as a download,
`nosniff` and a sandbox as for the documents. It answers `Range` requests
(206): Safari's audio player asks for two bytes before it plays anything.

`next.config.ts` sets `experimental.proxyClientMaxBodySize: '40mb'`. The proxy
(`src/proxy.ts`) buffers every request body and cut it at 10 MB by default,
so a 25 MB PDF — here and, until now, among the attachments too — arrived cut
short. The routes check their own limits. (Caddy in front of the app limits
a body only when its config has a `request_body` limit; worth a look before
the deploy.)

## Settings (server `.env`)

- `OPENAI_API_KEY` — already there for the assistant; without it nothing is
  sent and voice notes are kept without words.
- `OPENAI_TRANSCRIBE_MODEL` — optional, default `gpt-4o-mini-transcribe`
  (`whisper-1`, `gpt-4o-transcribe` also work).
- `OPENAI_TRANSCRIBE_LANGUAGE` — optional, ISO-639-1, default `de`.
- `OPENAI_BASE_URL` — as for the assistant; also used to test against a local
  stand-in.

## Files

New:

- `src/lib/documentation.ts` — rules (types, sizes, who may change what,
  recording type, `Range` parsing, transcription settings).
- `src/lib/documentation-db.ts` — create, list, delete, transcribe.
- `src/lib/transcription.ts` — the OpenAI transcription through the AI SDK
  (`transcribe` from `ai`, `openai.transcription(...)`).
- `src/app/documentation-actions.ts` — note, correct, delete, transcribe again.
- `src/app/api/projects/[id]/documentation/route.ts` — upload.
- `src/app/api/documentation/files/[id]/route.ts` — download.
- `src/components/project-documentation.tsx` — the section.
- `src/components/voice-recorder.tsx` — the recorder.
- `tests/unit/documentation.test.ts`, `tests/unit/transcription.test.ts`.
- `prisma/migrations/20261031130000_project_documentation/migration.sql`.

Changed:

- `prisma/schema.prisma` — the two models, two enums, a relation on `Project`
  and `User`.
- `src/app/(admin)/projects/[id]/card-popovers.tsx` — the popover item.
- `src/app/(admin)/projects/[id]/project-detail.tsx` — the section, twice.
- `src/app/my/page.tsx` — the section per job.
- `src/components/file-preview.tsx` — optional `href`.
- `src/lib/backup-tables.ts`, `src/lib/backup.ts` — the tables and files.
- `next.config.ts` — `proxyClientMaxBodySize`.
- `messages/de.json`, `messages/en.json` — namespace `documentation`,
  `projects.addDocumentationHint`.
- `.env.example`, `DEPLOYMENT.md` — the two optional settings.

## Rollback

1. Revert the commit (or the files above). Remove the section from
   `project-detail.tsx` and `src/app/my/page.tsx`, and the popover item.
2. Data: the tables can stay — nothing else reads them. To remove them, on a
   copy first:

   ```sql
   DROP TABLE "DocumentationFile";
   DROP TABLE "DocumentationEntry";
   DROP TYPE "TranscriptionState";
   DROP TYPE "DocumentationKind";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031130000_project_documentation';
   ```

   and delete the `storage/<projectId>/doku/` folders. Export what the client
   wants to keep first (the files are ordinary photos, PDFs and recordings).
3. `proxyClientMaxBodySize` may stay; taking it out brings back the 10 MB cut
   for the attachments as well.
