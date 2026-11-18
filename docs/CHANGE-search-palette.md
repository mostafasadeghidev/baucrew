# CHANGE: the search window (⌘K)

## What changed

The administration area has one search for everything: **⌘K** (Ctrl+K on
Windows) anywhere, or the magnifier — a search box at the top of the sidebar
(an icon on the folded rail), a button in the phone's top bar and a search
box in the overview's head. It opens a window over the page:

- **Results while typing** (140 ms after the last key; a newer query cancels
  the request of the older one), grouped, each group with its icon:
  **Projekte** first, then **Kunden**, **Mitarbeiter**, **Fahrzeuge**,
  **Geräte** (the office only) and the app's own **Seiten** ("Neues Projekt",
  "Einsatzplanung", "Einstellungen" …, matched in the browser).
- **A project** is found by its number (also by its end: "48", "0048"), the
  client's Projektnummer (`jobNumber`), its title, the customer's name, the
  site's street, town and postcode. The row shows the title, under it status,
  customer (left out when the title already starts with it), town and
  "Archiviert"; the numbers stand on the right.
- **Keys**: ↑ ↓ walk, Enter opens, ⌘Enter / Ctrl+Enter opens in a new tab,
  Esc clears the field and a second Esc closes. An Enter pressed before the
  results for what is typed have come opens the first of them once they are
  there. Every row is a link, so middle click and ⌘-click work as anywhere.
- **Opening a project**: on the projects board (`/projects`) the card opens
  over the board (`cardHref`, docs/CHANGE-card-route.md); everywhere else —
  the overview included — the project's full page (`/projects/<id>`), because
  there is no board there to lay a card over and a cold card address
  redirects to the page anyway.
- **Empty field**: the projects last opened from the window ("Zuletzt
  geöffnet", six, kept per user in the browser's localStorage under
  `baucrew.search.recent.<username>`) and three quick entries.
- **"/" does not open it**: on the board "/" is already the board's own
  search (board-keys.tsx).

### Who finds what

The server answers `GET /api/search?q=` (`src/app/api/search/route.ts`,
session cookie, EMPLOYEE refused). `searchEverything` in
`src/lib/global-search-db.ts`:

- projects go through `projectScope(user)` — a site manager finds only the
  projects they are named on (manager or crew);
- customers, employees, vehicles and devices are searched only for the office
  (`isOffice`); a site manager gets empty groups;
- no price, revenue or other money field is selected, so none can be sent.

The page entries in the window are filtered by role for tidiness only; every
page checks the role itself.

### Matching and ranking

`src/lib/global-search.ts` (pure, `tests/unit/global-search.test.ts`):
`queryWords` (at most six words), `wordVariants` (the spellings the database
is asked for: "müller" ↔ "mueller", "straße" ↔ "strasse"; `ILIKE` takes care
of case), `foldText`, `scoreRow`/`rankRows` (every word must fit some field;
whole field > start > start of a word > anywhere; number fields also compare
digits from the end), `metaLine`, `pushRecent`/`parseRecent`, `opensSearch`,
`moveActive`. Each group asks the database for a few more candidates than it
shows (projects 40 → 8, others 16 → 4) and ranks them.
`tests/db/global-search.test.ts` checks the site manager's scope, the office's
groups, umlauts, numbers and that no price is in the answer.

**No new index.** `ILIKE '%…%'` cannot use a b-tree index; at this company's
size (a few thousand projects) a scan takes milliseconds. Should it ever be
slow, a `pg_trgm` GIN index on `Project.name`, `number`, `jobNumber`, `city`
and `Customer.name` is the next step (a migration of its own).

### Project titles

The window shows `Project.name`. The branch that names a project after its
customer and trades ("Muster GmbH · Malern", `src/lib/project-title.ts`) keeps
that title in `Project.name` itself, so the window shows the new title as soon
as that change lands, without code here. Once it has landed, add
`sourceTitle` (the old typed title) to the project fields in
`searchEverything` and `projectFields` so the old names are still found.

## Files

- `src/lib/global-search.ts` — new, pure rules.
- `src/lib/global-search-db.ts` — new, the queries per group with scope.
- `src/app/api/search/route.ts` — new, the endpoint.
- `src/components/search-palette.tsx` — new: `SearchPalette` (the window, the
  ⌘K listener), `SearchButton` (box or icon), `openSearch()`.
- `src/app/(admin)/layout.tsx` — mounts `SearchPalette` (in a `Suspense`).
- `src/components/sidebar.tsx` — search box under the brand row; icon on the rail.
- `src/components/topbar.tsx` — magnifier in the phone's bar.
- `src/app/(admin)/dashboard/page.tsx` — search box in the overview's head.
- `messages/de.json`, `messages/en.json` — `nav.search`, the `search` namespace.
- `tests/unit/global-search.test.ts`, `tests/db/global-search.test.ts` — new.
- `AGENTS.md` — this file in the change log list.

No schema change, no migration.

## Rollback

1. Delete `src/lib/global-search.ts`, `src/lib/global-search-db.ts`,
   `src/app/api/search/`, `src/components/search-palette.tsx`,
   `tests/unit/global-search.test.ts`, `tests/db/global-search.test.ts`.
2. `src/app/(admin)/layout.tsx`: remove the `SearchPalette` import and its
   `<Suspense>` block.
3. `src/components/sidebar.tsx`: remove the `SearchButton` import and the
   search block above `<NavLinks>`.
4. `src/components/topbar.tsx`: remove the `SearchButton` import and element
   (and the comment's mention of the magnifier).
5. `src/app/(admin)/dashboard/page.tsx`: remove the `SearchButton` import and
   element in the head.
6. `messages/*.json`: remove `nav.search` and the `search` namespace.
7. Remove this file and its line in `AGENTS.md`.

What the browsers have stored (`baucrew.search.recent.*`) is harmless and can
stay.
