# CHANGE: the card as a route of its own (`/projects/card/<id>`)

## What changed

A card opened from the board or the list used to live in the board page's
address as `?card=<id>`: every open and close re-rendered the whole projects
page — board query, columns, cards — only to draw or remove the sheet over it.

The card is now a **route of its own**, `/projects/card/<id>`, rendered in a
parallel `@modal` slot of the projects layout and intercepted on soft
navigation (`(.)card/[id]`): opening a card streams the sheet in over the
board, closing it goes back in history, and the board or the list underneath
stays exactly as it is — the way a Trello card opens over its board.

1. **The slot.** `src/app/(admin)/projects/layout.tsx` renders `children`,
   the `modal` slot and the pending frame. `@modal/(.)card/[id]/page.tsx` is
   the intercepted card: `requireStaff`, the project's page (`ProjectDetail`)
   inside `CardSheet`, with the two things the sheet needs of the board
   computed from the address's context params — where a save returns to
   (`cardReturnTo`) and where the card may be moved to (`assembleMovePlaces`
   from `src/lib/card-move-places.ts`, scoped by `projectScope(user)`, no
   prices). `@modal/(.)card/[id]/loading.tsx` shows the sheet's frame with
   the route's first reply. `@modal/page.tsx`, `@modal/[...catchAll]/page.tsx`
   and `@modal/default.tsx` return `null`, so the sheet closes when the reader
   moves on to the bare board, the templates, the drafts or the import, and a
   cold load of any other projects address has no card open.
2. **A cold load shows the full page.** `src/app/(admin)/projects/card/[id]/page.tsx`
   is what a bookmark, a refresh or a shared link reaches: `requireStaff`,
   then `redirect('/projects/<id>')` — there is no board to lay the sheet
   over.
3. **The pending frame.** `src/app/(admin)/projects/pending-card-sheet.tsx`
   (`PendingCardSheet`, `CardSheetPending`) catches the click on a card
   (`[data-card-id]`) or a card link (`a[href*="/projects/card/"]`) in the
   capture phase and draws the sheet's skeleton on the same frame, before the
   server has answered; it hands over to the route's loading state (the same
   picture) and goes away when the card's address stands in the window, when
   a close wins the race, or after 700 ms when no navigation followed. Clicks
   with modifier keys and clicks on controls inside a card are left alone.
4. **The addresses, pure and tested.** `src/lib/card-url.ts`: `cardPath`,
   `isCardPath`, `cardHref(context, id, pop?)` (the board context — board,
   view, search, year, filters — rides along as search params; the sheet's
   own `card`/`template` params are dropped; `pop` opens one of the card's
   small windows) and `cardReturnTo(context, id)` (a save from the sheet
   returns to `/projects?…&card=<id>`, the form the board page itself still
   answers, so the board comes back fresh with the sheet still open; `pop`
   is dropped so a window is not opened twice). `tests/unit/card-url.test.ts`.
5. **Old links keep working.** The board page (`page.tsx`) still draws the
   sheet for `?card=<id>` and `?template=<id>`; `useCloseSheet` in
   `card-sheet.tsx` closes with `router.back()` on the card route and by
   deleting the params on the board page. Every place that opens a card now
   uses `cardHref`/`cardPath`: the board (`kanban.tsx`), the list and the
   planning lines (`page.tsx`), the card's own menu (`[id]/sheet-menu.tsx`,
   "Link kopieren"), the card templates (`card-templates.tsx`), a checklist
   item turned into a card (`src/components/checklist.tsx`) and the mentions
   list (`src/components/mentions.tsx`).
6. **Closing the sheet.** `card-sheet.tsx` also gained the click beside the
   card: it counts only when the press starts and ends outside, closes only
   the open menu/popover/dialog while one is open, and asks before discarding
   unsaved typing (`data-sheet-draft`, fields without `data-saves-on-blur`)
   through an `AlertDialog` (`projects.cardDiscardTitle/Body/Confirm`).
   Escape goes to the top layer first.

Messages: `projects.cardLoading`, `projects.cardDiscardTitle`,
`projects.cardDiscardBody`, `projects.cardDiscardConfirm` (de + en).

No migration. No change to who may open a card: both routes call
`requireStaff`, the card's content is `ProjectDetail` with the same access
rules as before, and the move places are read within `projectScope(user)`.

## Files

New: `src/app/(admin)/projects/layout.tsx`,
`src/app/(admin)/projects/@modal/(.)card/[id]/page.tsx`,
`src/app/(admin)/projects/@modal/(.)card/[id]/loading.tsx`,
`src/app/(admin)/projects/@modal/[...catchAll]/page.tsx`,
`src/app/(admin)/projects/@modal/default.tsx`,
`src/app/(admin)/projects/@modal/page.tsx`,
`src/app/(admin)/projects/card/[id]/page.tsx`,
`src/app/(admin)/projects/pending-card-sheet.tsx`, `src/lib/card-url.ts`,
`src/lib/card-move-places.ts`, `tests/unit/card-url.test.ts`,
`tests/unit/card-move-places.test.ts`.

Changed: `src/app/(admin)/projects/card-sheet.tsx`,
`src/app/(admin)/projects/page.tsx`, `src/app/(admin)/projects/kanban.tsx`,
`src/app/(admin)/projects/card-move.tsx` (types moved to
`src/lib/card-move-places.ts`), `src/app/(admin)/projects/card-templates.tsx`,
`src/app/(admin)/projects/list-menu.tsx`,
`src/app/(admin)/projects/[id]/sheet-menu.tsx`,
`src/app/(admin)/projects/[id]/project-detail.tsx` (`sheet` prop carries
`returnTo` and `move`), `src/components/checklist.tsx`,
`src/components/mentions.tsx`, `messages/de.json`, `messages/en.json`,
`docs/BENUTZERHANDBUCH.md` (the card's address).

## Rollback

The feature has no data of its own; rolling it back is a code change only.

1. `git revert` the commit that introduced this file (the integration merge
   of October 2026 carries it together with other work — in that case revert
   by hand as follows).
2. Delete the new files listed above (`layout.tsx`, the `@modal` tree,
   `card/[id]/page.tsx`, `pending-card-sheet.tsx`, `src/lib/card-url.ts`;
   `src/lib/card-move-places.ts` and its test may stay if `card-move.tsx` is
   left importing from it).
3. In the changed files, open cards with `?card=<id>` on `/projects` again:
   replace every `cardHref(ctx, id)` with the board address plus `card=<id>`
   and every `cardPath(id)` with `/projects?card=<id>`; in `card-sheet.tsx`
   drop the `isCardPath` branch of `useCloseSheet` (the param-deleting path
   is the whole close again). The click-beside-the-card behaviour (point 6)
   is independent and may stay.
4. Remove `projects.cardLoading` from both message files (the discard keys
   stay with point 6).
5. Links already shared as `/projects/card/<id>` then 404; a rewrite
   `/projects/card/:id → /projects?card=:id` in `next.config.ts` keeps them
   alive if wanted.
6. `npm run typecheck && npx eslint src prisma tests && npm test && npm run build`.
