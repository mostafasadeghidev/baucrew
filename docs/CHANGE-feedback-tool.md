# CHANGE: The feedback tool — comment mode on every page, feedback tasks for the office and the agents

## What changed

The temporary `/checklist` page (a hand-kept list in `src/app/checklist/items.ts`)
is replaced by a feedback tool inside the app, after the review desk of the
GM Events project — its behaviour, not its look.

1. **Comment mode.** Anybody logged in adds `?comment` to any page (admin area
   and `/my` alike, `&comment` when the address already has a query). A bar of
   tools appears at the foot of the page:
   - **Kommentar** — click the element meant; the viewport is captured with the
     element and the click marked in red, then the comment form opens above the
     bar. **Pfeil** and **Zeichnen** capture the viewport first and open the
     drawing editor; "Fertig" leads to the same form.
   - The form shows the picked element's text, the screenshot (draw on it again
     or retake it), lets one more picture be attached, and sends. The author is
     whoever is logged in — no name prompt.
   - Stored with every comment: the page (path and query), the element (CSS
     selector, its text, where in it the click was), browser and system,
     device class, viewport, screen and pixel ratio, language, time zone,
     theme, scroll position, and the screenshot(s). Password fields and
     elements marked `data-private` are left out of the screenshot.
   - Internal navigation keeps comment mode on (the word is put back on every
     address); a page loaded without `?comment` never shows the tools. The ✕
     leaves comment mode; the arrows minimise the bar to one pill.
   - Open items left on the page show as numbered pins on their elements. The
     dashboard's "Seite öffnen" opens the page in comment mode with the element
     outlined (`&feedbackTarget=<selector>`).
   - The capture library (`html-to-image`, new dependency) and the toolbar load
     only when comment mode is on.
2. **Feedback tasks** — **Einstellungen → Feedback-Aufgaben**, `/feedback` (the
   crew: `/my/feedback`, also in its user menu). The office's user menu, at the
   foot of the sidebar, has **Kommentieren** (comment mode on the page one is
   on) and **Feedback-Aufgaben**. One search, filter and sort
   shared by **Liste** and **Kanban** (statuses as columns; cards dragged
   between them). A tick on each item marks it done (or opens it again). A
   click opens the item in a drawer beside the list, linkable as `?item=79`:
   comment, pictures (enlarge, download), the element, **Notizen für den
   Agenten**, the **Vorschlag des Agenten** (suggestion, open question,
   before/after text as a word diff, before/after pictures, how it was
   checked) with **Annehmen / Ablehnen** kept apart from the status, the
   decision history (a decision on an older proposal is flagged), the status
   history and the details (device and the progress list's session/refs).
   Unsaved notes survive switching items; leaving the page warns.
3. **Who may do what** (`src/lib/feedback.ts`, enforced in
   `src/app/feedback-actions.ts` and the routes):
   - Everybody logged in: comment, open the tasks, write notes.
   - The office (ADMIN, MANAGER): status, tick, drag, edit title/text/"Wartet
     auf", record the proposal and its pictures, accept/reject, delete.
   - **Visibility.** A comment written by the office is `officeOnly`: its
     screenshot may show prices, so only the office sees it. Site managers and
     the crew see what they and each other wrote, never an office item —
     filtered in the database query, in the picture route and in the pins.
     Pictures are served `no-store`, so a shared tablet does not show the next
     person what the last one was allowed to see.
4. **For coding agents.**
   - **Für Agent kopieren** writes the shown items as JSON (schema in
     `feedbackHandoff`, `src/lib/feedback.ts`): comment, page link, element,
     device, context, the open question, the proposal, image references (URLs,
     never the pictures themselves), notes and decisions newest first with
     `evidenceMatchesCurrent`, status history. **Kopieren** in the drawer does
     the same for one item. When the clipboard is refused a dialog shows the
     JSON to copy by hand.
   - `npx tsx --env-file=.env scripts/feedback-export.mjs` prints the open
     items from the database (read-only): readable, or `--json` for the same
     JSON with each picture's file path under `storage/`; `--all`,
     `--status=TODO,DECISION`, `--waiting=agent`, or item numbers.
5. **The progress list moved in.** Migration
   `20261031120100_feedback_checklist_entries` writes the 62 entries of
   `items.ts` as items with source `checklist`: same numbers, title, note as
   the comment, status done → Erledigt, open → Zu erledigen, blocked →
   Entscheidung nötig, "who it waits on" kept, session and refs in the
   context, office-only. New items count on from the highest number: the first is #79.
   `/checklist` redirects to the tasks; `items.ts` is gone. The list's
   standing rules were already in `AGENTS.md` / `CLAUDE.local.md` and were not
   carried over.
6. **Backups** include the four new tables and the feedback pictures' files.

Screenshots are stored through the app's file storage (`storage/feedback/<item>/…`,
or `FILE_STORAGE_DIR`), as JPEG of at most 1800 px; only PNG, JPEG and WebP
are accepted, checked by their bytes, at most 8 MB.

## Agents and the live list

There is one list: the live site's. Agents read and write it over the live
site's MCP endpoint (`POST /api/mcp`) with a key that opens nothing else, so
nothing has to be synced and the local database stays a test copy.

- **Tools** (`src/lib/mcp-catalog.ts` → "Feedback", work in
  `src/lib/feedback-tools.ts`): `list_feedback` (open by default; status,
  waitingOn, source, search, numbers), `get_feedback`, `get_feedback_image`
  (the picture itself, as an MCP image), `add_feedback` (source "agent",
  lands in INBOX), `add_feedback_note`, `record_feedback_proposal` (only the
  fields sent change; a new proposal makes earlier decisions out of date, as in
  the app) and `set_feedback_status` (INBOX, TODO, DECISION, IN_PROGRESS —
  never DONE or CLOSED; accepting and rejecting are not offered either). The
  answers are the handoff JSON of "Für Agent kopieren". Site managers get the
  reading tools and notes; proposals and status are the office's. The in-app
  assistant is not offered these tools (`mcpOnly`).
- **Feedback key**: an API key may be limited (`ApiKey.scope`, migration
  `20261102120000_api_key_scope`). Einstellungen → API-Schlüssel → Zugriff "Nur
  Feedback-Aufgaben" makes one: it opens only the MCP endpoint and there only
  the feedback tools; the REST API refuses it (`authenticateApi` lets a limited
  key through only a door that names its scope). Existing keys are full keys,
  as before.
- **Setup, once per computer the agents run on**:
  1. On the live site, an account of its own for the agent (Einstellungen →
     Benutzer: name `agent`, role Manager, no financial access), so its notes
     and status changes show under its own name. Then Einstellungen →
     API-Schlüssel: a key for `agent` with Zugriff "Nur Feedback-Aufgaben".
  2. `claude mcp add --scope user --transport http baucrew-feedback
     https://<live site>/api/mcp --header "Authorization: Bearer <key>"` —
     every Claude Code session on that computer, in every worktree, then has
     the tools. The key stays in the user's Claude settings, never in the
     repository.
  3. For `scripts/feedback-export.mjs`: `BAUCREW_LIVE_URL` and
     `BAUCREW_LIVE_KEY` in the main checkout's `.env`. The script reads the
     live list by default and fetches the pictures into
     `<temp>/baucrew-feedback/`; `--local` reads this machine's database.
  Revoking the key on the live site cuts every agent off at once.
- **Local copy notice**: outside the live site (`next dev` — a developer's
  machine, the demo copy) the comment bar says "Lokale Kopie – Kommentare hier
  erscheinen nicht in der Live-Liste", with a link to the same page on the live
  site when `BAUCREW_LIVE_URL` is set.

## Data model (migration `20261031120000_feedback_tool`)

- `FeedbackItem` — number (unique, counting), title, comment, status
  (`FeedbackStatus`: INBOX, TODO, DECISION, IN_PROGRESS, DONE, CLOSED), source,
  waitingOn, officeOnly, page, anchor/metadata/context (JSON), the proposal
  (suggestion, decision, beforeText, afterText, completionNote), version (every
  change raises it; an edit or a note made on an older version is refused as
  "stale"), author.
- `FeedbackNote` — a note or an accept/reject, never edited, with the item
  version and the proposal as it stood (`evidence`).
- `FeedbackStatusChange` — every status change, by whom and when.
- `FeedbackAttachment` — the pictures: screenshot, upload, before, after.

## Files

New: `prisma/migrations/20261031120000_feedback_tool/`,
`prisma/migrations/20261031120100_feedback_checklist_entries/`,
`src/lib/feedback.ts`, `src/lib/feedback-page.ts`, `src/lib/feedback-db.ts`,
`src/app/feedback-actions.ts`, `src/app/api/feedback/attachments/[id]/route.ts`,
`src/app/api/feedback/pins/route.ts`, `src/app/(admin)/feedback/page.tsx`,
`src/app/my/feedback/page.tsx`, `src/components/feedback/*` (comment-mode,
comment-mode-mount, comment-toolbar, capture, drawing-editor, desk,
item-drawer, image-viewer, status-pill, toolbar-styles),
`scripts/feedback-export.mjs`, `tests/unit/feedback.test.ts`,
`tests/unit/feedback-page.test.ts`, this file.

Changed: `prisma/schema.prisma` (four models, one enum, four relations on
`User`), `src/app/layout.tsx` (mounts comment mode), `src/app/checklist/page.tsx`
(redirect), `src/app/(admin)/settings/page.tsx` (the entry card),
`src/app/my/layout.tsx` and `src/app/my/user-menu.tsx` (menu link),
`src/components/sidebar.tsx` (the office's user menu: comment mode and tasks),
`src/lib/backup-tables.ts`, `src/lib/backup.ts`, `messages/de.json`,
`messages/en.json` (`feedback.*`), `package.json` / `package-lock.json`
(`html-to-image` 1.11.13), `AGENTS.md`.

Removed: `src/app/checklist/items.ts`.

Agents and the live list (added later): new `src/lib/feedback-tools.ts`,
`prisma/migrations/20261102120000_api_key_scope/`,
`tests/db/feedback-agent.test.ts`; changed `src/lib/mcp.ts` (image answers),
`src/lib/mcp-catalog.ts`, `src/lib/mcp-tools.ts`, `src/lib/api-keys.ts`,
`src/lib/api-auth.ts`, `src/app/api/mcp/route.ts`,
`src/app/api/assistant/route.ts`, `src/lib/feedback-db.ts`
(`getFeedbackByNumber`, `feedbackImageFor`, source and waitingOn on create),
`src/app/(admin)/settings/api-keys/*` (the Zugriff choice and column),
`src/components/feedback/comment-mode-mount.tsx`, `comment-mode.tsx`,
`comment-toolbar.tsx` (the local copy notice), `scripts/feedback-export.mjs`,
`prisma/schema.prisma` (`ApiKey.scope`), `messages/*.json`, `.env.example`,
`docs/API.md`, `AGENTS.md`, `tests/unit/api-keys.test.ts`,
`tests/unit/mcp.test.ts`, `tests/unit/mcp-catalog.test.ts`.

## Rollback

1. Revert the merge commit of this change (`git revert -m 1 <merge>`), which
   restores `/checklist` and `items.ts` and removes the code and the dependency.
2. Drop the tables on every database the migrations ran on (a backup first —
   comments and pictures are lost):

   ```sql
   DROP TABLE "FeedbackAttachment", "FeedbackStatusChange", "FeedbackNote", "FeedbackItem";
   DROP TYPE "FeedbackStatus";
   DELETE FROM "_prisma_migrations"
    WHERE migration_name IN ('20261031120000_feedback_tool', '20261031120100_feedback_checklist_entries');
   ```

3. Delete the pictures: `storage/feedback/` (in Docker the files volume's
   `feedback/` folder).
4. Backups taken while the tool existed carry `feedbackItems` …
   `feedbackAttachments`; an older app restores them without those keys.

To take back only the agents' access (keep the tool): revoke the feedback keys
on the live site, revert the merge of "Agents and the live list", then on every
database it ran on (backup first; a limited key becomes unusable, not full):

```sql
DELETE FROM "ApiKey" WHERE "scope" IS NOT NULL;
ALTER TABLE "ApiKey" DROP COLUMN "scope";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102120000_api_key_scope';
```

A backup made with the column restores into the older app only after removing
`scope` from its `apiKeys` rows.
