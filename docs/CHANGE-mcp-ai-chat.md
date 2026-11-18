# CHANGE: MCP tools completed, and an assistant inside the app

## What changed

**The MCP layer** (`POST /api/mcp`) now covers what a manager does day to day,
and the same tools drive a new assistant panel in the office pages.

- **One catalogue, two doors.** `src/lib/mcp-catalog.ts` lists every tool: its
  description, its input, who may use it (`staff` = office and site managers,
  `office` = admin and manager, `financials` = who may see money) and whether
  it reads or writes. `src/lib/mcp-tools.ts` does the work by calling the
  service layer (`src/lib/api-service.ts`) the REST API already used. The MCP
  route and the assistant route both take their tools from there.
- **New tools**: `update_project` (details, address, dates, Projektnummer,
  site manager, price when allowed), `list_boards`, `move_project_to_column`
  (status plus the column's rule, as dragging the card does),
  `list_comments`, `add_comment`, `list_defects`, `add_defect`,
  `set_defect_resolved`, `get_customer`, `update_customer`,
  `move_schedule_entry`, `update_schedule_entry`, `cancel_schedule_entry`.
  `list_schedule` filters by employee or vehicle as well. 25 tools in all.
- **The Projektnummer** (`Project.jobNumber`) is in every project answer, is
  searched, finds a project by itself, and can be set on create and update;
  a number another project has is refused (409 `jobNumberTaken`).
- **Same checks as the pages, at the service layer**, so they hold for the
  REST API, MCP and the assistant alike:
  - a site manager sees and changes only the projects they are named on
    (`projectScope` / `canSeeProject`); another project answers "not found";
  - customers (list, read, create, update) are the office's only
    (`assertOffice`, as `requireManagement` on the pages);
  - a project a site manager creates names them as its site manager, as
    "Karte hinzufügen" on the board does, or they could not see it.
- **Money**: the service DTOs already leave prices out for a user without
  financial access; the tool door now removes every money key from the answer
  once more (`withoutFinancials`), takes the price field out of the input it
  offers, and refuses a price sent anyway.
- **`tools/list` is per user**: a manager without financial access does not
  see the revenue tools, a site manager sees no customer tools.
- **Schedule edits** live in `src/lib/schedule-service.ts` (`moveEntry`,
  `updateEntryDay`, `cancelEntry`); the schedule page's drag now calls
  `moveEntry` too. Taking a day out *cancels* it (reversible), never deletes.

**The assistant** (✦ button above the bell, bottom right, office pages only):

- `src/components/assistant-panel.tsx` — the drawer; `src/app/api/assistant/route.ts`
  — streams the answer (AI SDK 7, `streamText` + `useChat`), with the signed-in
  user's session as the identity: the same tools, the same rights.
- **Every write is a proposal.** The model's call to a write tool is held
  (`toolApproval: 'user-approval'`); the panel shows the record and each field
  "from → to" with names in place of ids (`src/lib/assistant-proposal.ts`).
  Only "Ausführen" runs it. The confirmation is signed by the server
  (`experimental_toolApprovalSecret`), so a changed browser cannot fake a yes
  or change the input after it was shown — checked by hand: a tampered input
  and a missing signature were both refused.
- After a change: "Erledigt" with a link to the changed record, and the page
  behind the panel refreshes.
- Provider: OpenAI, `OPENAI_API_KEY` (and optional `OPENAI_MODEL`,
  `OPENAI_BASE_URL`, `ASSISTANT_APPROVAL_SECRET`) from the server's
  environment. Without a key the panel says "Noch nicht eingerichtet" and the
  route answers 503; nothing else is affected.
- Crew accounts never see the button (it lives in the `(admin)` layout) and
  the route refuses them.

## Second round (2 Nov 2026): kept conversations, pages, questions, new look

- **Conversations are kept, per person.** New table `AssistantChat`
  (migration `20261102120000_assistant_chats`): the conversation as the panel
  draws it (`messages`, the AI SDK's UI messages), a title from the first
  question, `archivedAt`, and `updatedAt` = when it was last talked in. The
  route saves it after every answer (`src/lib/assistant-chats.ts`). Every
  read and write names the user: somebody else's id reads as "not found" and
  is never written (`mayWriteChat`); deleting a user deletes their
  conversations.
- **History and archive.** The panel opens on the latest conversation not put
  away; the pen button starts a new one, and the old one goes to the history
  (speech-bubble button: by day, "Gespräche" and "Archiv"). A conversation is
  archived, restored, or — from the archive — deleted for good after a
  question. Talking on in an archived one brings it back. Server actions in
  `src/app/assistant-actions.ts`.
- **Closing the panel or changing pages loses nothing**: the chat stays
  mounted while the panel is closed; a reload loads it from the server. An
  answer cut off by leaving the page offers "Fortsetzen".
- **Two tools that run in the browser** (`src/lib/assistant-client-tools.ts`,
  not offered over MCP): `open_page` takes the person to a page of the app —
  only paths in the app's own sections (`safeAppPath`), the page still checks
  the rights — and the panel stays open beside it (on a phone it steps
  aside); `ask_user` shows a question with 2–6 answers to click (typing
  answers it too). Neither changes data, so neither asks for confirmation.
- **The page is context.** Each request names the page the person is on, so
  "dieses Projekt" means the project on screen.
- **Undo** on a finished change whose fields all had a value: sends "mach
  das rückgängig: Feld: alter Wert" — which comes back as an ordinary
  proposal to confirm. Nothing is undone without a second yes.
- **Honest wording**: a short line right before a proposal card ("Ich führe
  das jetzt aus") is not shown — the card says what is proposed, and nothing
  runs before the yes. The instructions also forbid announcing and ISO dates.
- **New look**: the panel floats as an inset card; answers are set by
  Streamdown (`streamdown`, Vercel's renderer for streamed AI text: Markdown
  that never shows half-written marks, tables, links that stay inside the
  app) with the app's own type and colour tokens; look-ups are one quiet line;
  proposal cards have an icon, a from → to table and a footer with the
  buttons; questions are buttons; the composer is a rounded field with a
  round send button. The chat's code loads only when the panel first opens.

## Touched files

- `src/lib/mcp-catalog.ts` — new (pure: tools, access, money filter)
- `src/lib/mcp-tools.ts` — rewritten on the catalogue; `runTool`, `mcpToolsFor`
- `src/lib/api-service.ts` — site-manager scope, `assertOffice`, Projektnummer,
  `listBoards`, `moveProjectToColumn`, `moveScheduleDay`, `updateScheduleDay`,
  `cancelScheduleDay`, `url` / `workOrderUrl` in answers
- `src/lib/schedule-service.ts` — `moveEntry`, `updateEntryDay`, `cancelEntry`
- `src/app/(admin)/schedule/actions.ts` — `moveScheduleEntry` calls `moveEntry`
- `src/lib/authz.ts` — `canViewFinancials` takes any `{ role, canViewFinancials }`
- `src/app/api/mcp/route.ts` — per-user tool list
- `src/lib/assistant.ts`, `src/lib/assistant-proposal.ts`, `src/lib/record-url.ts` — new
- `src/app/api/assistant/route.ts`, `src/components/assistant-panel.tsx` — new
- `src/app/(admin)/layout.tsx` — renders the panel
- `messages/de.json`, `messages/en.json` — `assistant.*`
- `package.json` — `ai`, `@ai-sdk/openai`, `@ai-sdk/react`
- `.env.example`, `docker-compose.yml`, `DEPLOYMENT.md`, `docs/API.md`, `AGENTS.md`
- Tests: `tests/unit/mcp-catalog.test.ts`, `tests/db/mcp-tools.test.ts`
- Second round: `prisma/schema.prisma` (`AssistantChat`, `User.assistantChats`),
  `prisma/migrations/20261102120000_assistant_chats/`,
  `src/lib/assistant-chats.ts`, `src/lib/assistant-history.ts`,
  `src/lib/assistant-client-tools.ts`, `src/app/assistant-actions.ts`,
  `src/components/assistant/` (`assistant-chat.tsx`, `conversation.tsx`,
  `parts.tsx`), `src/components/assistant-panel.tsx` (now the shell only),
  `src/components/ui/button.tsx` (`btn.ghostIcon`), `src/lib/backup-tables.ts`
  (the conversations are in the backup; an older backup restores without
  them), `package.json`
  (`streamdown`), tests `tests/unit/assistant-client-tools.test.ts`,
  `tests/db/assistant-chats.test.ts`

## Rollback

- **Switch the assistant off**: remove `OPENAI_API_KEY` from the server's
  `.env` and restart. The button stays and says "not set up"; nothing is sent
  to OpenAI.
- **Remove the assistant**: delete `src/app/api/assistant/`,
  `src/components/assistant-panel.tsx`, `src/lib/assistant.ts`,
  `src/lib/assistant-proposal.ts`, `src/lib/record-url.ts` (and its test
  block); take the two `assistant` lines out of `src/app/(admin)/layout.tsx`;
  drop the `assistant` key from both message files; `npm uninstall ai
  @ai-sdk/openai @ai-sdk/react`; remove the `OPENAI_*` /
  `ASSISTANT_APPROVAL_SECRET` lines from `.env.example`, `docker-compose.yml`
  and `DEPLOYMENT.md`.
- **Keep the assistant, drop the second round**: revert its commit, then on
  each database `DROP TABLE "AssistantChat";` and
  `DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102120000_assistant_chats';`
  (the kept conversations go with it).
- **The MCP tools as they were**: revert the first commit. It made no
  migration and no data changed shape. Note that reverting
  also takes back the site-manager scope and the office-only customers at the
  service layer (only office users can hold API keys, so no existing key loses
  anything by this change).
