# Projects: board-first controls and matching list scope

29 September 2026. First batch from the project audit of 29 September 2026 (kept outside the repository, in `local/`, as it maps security findings by file and line).

## Why and resulting behavior

The board is the client's preferred way to work. Its toolbar used several button sizes and styles, while the list put the same controls elsewhere and dropped completion/activity filters on the way back to the board. Revealing a card's completion checkbox also reduced the title's width.

Both views now render one toolbar. The selected board name opens a picker, grouped with icon-only board/list links. Search opens from a magnifier into a focused popover; filter/year stay beside it, and controls share a 36px height, 6px corners, semantic colors, 14px type, 16px icons, and consistent focus rings. The existing board canvas, column colors, cards, and drag behavior remain the reference. Icons retain accessible names and hover titles at every size; the compact bar wraps on small screens. Table columns retain enough width for project titles and scroll within their container.

Following user feedback, the completion checkbox is overlaid at the left edge. The title slides 20px in 150ms on hover or keyboard focus; its text width and the card height remain fixed. Completed cards and touch interfaces keep the checkbox visible. Reduced-motion preferences disable the animation. The title retains enough right clearance for the pencil.

The list for a selected board now uses that board's membership rules, including rule-only columns. **Alle Projekte / All projects** provides either a table or a board with one column per status. These derived all-project columns cannot be renamed, reordered, or removed; no board configuration is written. Old list links without an explicit board retain their company-wide scope. Year, search, permissions, archive exclusion, and other filters still apply. The table remains paginated. Its status filters show the selected board's statuses; the preparation filter remains available.

Both directions of the view switch preserve completion and activity filters. Selecting another board keeps common filters but removes status, page, and old card/template/archive/activity panel parameters. List project names open the same project overlay as board cards. Archive and activity panels are available through the common menu; closing activity now actually removes its URL parameter.

Navigation uses Next.js `useLinkStatus` for a fixed-position pending indicator. The last-board preference is written as a non-sensitive browser cookie on navigation, removing the old authenticated preference Server Action from each board click. Authentication/session cookies are untouched.

The board query applies board membership before loading card relations and skips the unused table query/count. `boardProjectsWhere` expresses the same membership as `columnFor`; a normal column includes the whole status together with its rule columns, while a rule-only board includes only matching cards. Cross-board move positions use a separate lightweight query for open cards, independent of the displayed board or filters. Full year/history scans and global polling remain follow-up work.

## Files changed by this batch

- `src/app/(admin)/projects/toolbar-styles.ts` — shared control styles (new).
- `src/app/(admin)/projects/projects-toolbar.tsx` — common board/list header (new).
- `src/app/(admin)/projects/project-nav-link.tsx` — navigation feedback and preference persistence (new).
- `src/app/(admin)/projects/board-tabs.tsx` — board picker with board/all-project scope links.
- `src/app/(admin)/projects/board-filter.tsx` — consistent filter trigger.
- `src/app/(admin)/projects/year-picker.tsx` — consistent year trigger.
- `src/app/(admin)/projects/board-menu.tsx` — common menu; hide card-display preference in the table.
- `src/app/(admin)/projects/actions.ts` — remove the unused preference Server Action/imports.
- `src/app/(admin)/projects/kanban.tsx` — animated completion-control reveal with stable wrapping.
- `src/app/(admin)/projects/project-search.tsx` — on-demand search popover (new).
- `src/app/(admin)/projects/board-keys.tsx` — `/` opens the search popover.
- `src/app/(admin)/projects/done-tick.tsx` — visible keyboard focus.
- `src/app/(admin)/projects/page.tsx` — shared layout, board-scoped queries, independent move positions, shared panels and overlay links, table widths.
- `src/components/live-search.tsx` — URL-synchronized draft, timer cleanup/navigation cancellation, accessible label and optional styling.
- `src/lib/projects-view.ts` — common scope-navigation URL rule.
- `src/lib/board-query.ts` — database membership predicate (new).
- `tests/unit/projects-view.test.ts` — filter round-trip and scope-change cases.
- `tests/db/board-query.test.ts` — database membership compared against actual board rules (new).
- `messages/de.json`, `messages/en.json` — all-project scope and view-navigation labels.
- `docs/BENUTZERHANDBUCH.md` — current toolbar and list/board behavior.
- the audit of 29 September 2026 (`local/`, not in the repository) — progress and remaining work.
- `docs/CHANGE-projects-board-first.md` — this record.

Existing reporting-cleanup changes in the working tree were preserved. No schema or stored project-data migration is needed.

## Design revision: compact navigation and animated reveal

The user rejected the separate board tabs, labeled view buttons, and permanent checkbox slot. The revision groups the selected board picker with icon-only view links in one desktop row. The existing Geist typography, neutral surfaces, blue action accent, subtle borders, and 4px spacing rhythm keep attention on work orders, customer names, job phases, due dates, and site assignments. Search/filter/create icons keep secondary tools compact; the year stays readable. Search and board selection float above the canvas only when opened. No second permanent navigation bar is introduced.

The all-project scope now has derived status columns, so choosing Board never silently switches to a different scope. This uses the existing project-status movement actions and access filters, with configuration edits disabled for the derived columns.

## Verification

- TypeScript, ESLint, unit tests, and production build passed during implementation; final checks are recorded in the audit progress note.
- 668 unit tests passed; the full isolated database run passed 715 tests in 84 files.
- Nine new database cases compare query membership to `columnFor`: empty board, normal column, every rule, overlapping rules, normal plus rule columns, and fixed-start precedence over a rough planning month. The empty-board case caught an empty-OR behavior and now uses an explicit empty ID predicate.
- Synthetic browser checks: unchanged title/card geometry when controls appear through keyboard focus; shared toolbar in both views; completion/activity filters carried into board view; a rule-only board and table each showing the same four matching projects; list opening the shared card overlay. Narrow-screen checks prompted the compact toolbar and fixed table-column widths.
- A local production-build sample used 48 invented projects and three boards. Three warm full-HTML requests after warm-up: the first board went from 56–67 ms to 48–58 ms; the rule-only board from 45–58 ms to 37–49 ms. These small overlapping samples do **not** establish a material interaction-speed gain. HTML size increased with the new controls (about 284 → 296 KB on the first board). Client-navigation latency, larger datasets, and concurrency require the next measurement pass.
- The existing two filesystem-tracing build warnings and Vitest configuration warning remain tracked in the audit. No claim that this batch fixes them.

### Revision verification

TypeScript, ESLint, all 701 current unit tests, nine focused database membership tests, and the production build passed. Browser checks on invented data covered board picker navigation, All projects in both presentations (48 cards in the synthetic fixture), search autofocus, `/`, Escape, search retention across views, and a 390px viewport with no page overflow. On the final build, keyboard reveal moved a long title from x=288 to x=308 while preserving its 212×77px box and the card's 230px height. Hover uses the same CSS translation; no automated pointer-hover assertion was run. The final browser error log was empty. This is visual/interaction validation, not a new performance benchmark.

## Remaining work

Dialog focus trapping/restoration and nested Escape behavior; image dimensions/thumbnails; broader navigation race tests and error recovery; full year/status-history reads; polling scope; deferred edit options; a permanent browser regression suite. Card batching remains conditional on measurements. Access/security/recovery work remains deferred per the requested priorities.

## Rollback

Keep this batch in its own reviewed commit/PR, separate from existing reporting work. There is no database rollback.

After that commit exists, start from a clean checkout, find the commit that introduced this change log, and revert it on a new branch:

```sh
git switch -c codex/revert-projects-board-first
board_ui_commit=$(git log --diff-filter=A --format=%H -- docs/CHANGE-projects-board-first.md | head -n 1)
test -n "$board_ui_commit" && git revert "$board_ui_commit"
npm run typecheck && npx eslint src prisma tests && npm test && npm run build
```

If subsequent commits also changed these components, review conflicts against the behavior described above; do not revert unrelated reporting changes. Before the batch has been committed, reverse only this batch's hunks, remove its new files, and restore the original shared-search/tab/menu behavior together with the page loader. A blanket checkout of `page.tsx`, `kanban.tsx`, translations, or the manual would discard pre-existing reporting edits and must not be used.

The `project-board` preference cookie keeps the same name and format; it needs no migration or clearing. The new `board=all` URLs should be changed to `view=list` without a board parameter if rolling back to the old loader. Review the rollback through a PR, as required by CONTRIBUTING.
