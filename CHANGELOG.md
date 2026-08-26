# Changelog

All notable changes to BauCrew are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [1.23.0] — 2026-08-27

### Added
- **Devices and machines** (`Geräte` in the menu) — one row per physical unit,
  with inventory number, kind, storage place, notes and a link to a short
  instruction video. The list says for every device whether it is **in the
  store** (green) or **on a site / with a person** (red), and the search covers
  name, number, kind and place: the "where is the small fan?" question the
  customer described.
- **Hand out and take back.** A device goes to a site or to an employee; while
  it is out nobody can hand it out a second time, and the history keeps who had
  it when. The project page carries a card **Geräte auf dieser Baustelle**, so
  an interrupted site does not hide what is still standing there.
- Availability is never stored — it is read from the open handout, and every
  device row carries `externalSystem` / `externalId` / `source` so a later sync
  with the customer's equipment system fills these same tables instead of
  replacing them (groundwork for M16–M19).

## [1.22.0] — 2026-08-26

### Added
- **Recorded time on the project page.** A card shows the hours booked on that
  project: the total, the split per employee and the last bookings with day,
  time and duration. Accounts with financial access also see the **order value
  per hour** — the figure the office checks while the job is still running,
  instead of waiting for the finished-projects report.
- **The crew can add a forgotten booking themselves.** *Zeit nachtragen* sits
  under the start/stop button on today's card and is the only button on an
  older day: from, to, save. Allowed for today and the last seven days, only on
  a project the person is on, and only for a plausible interval (max. 16 h).
  The office sees these entries marked **nachgetragen** next to the ones that
  came from the clock, and can correct or delete them as before.

## [1.21.1] — 2026-08-26

### Fixed
- **The "to" date in the assignment dialog promised more than it did.** The
  button counted every day of the range ("2 Einsätze anlegen") while saving
  silently skipped days on which the project was already planned — adding
  somebody to the crew and extending to the next day left that next day
  untouched. The dialog now says what really happens: it counts only the days
  it will create, states how many days already exist, and offers a tick box
  **"Die bestehenden Tage auch anpassen"** that brings crew, vehicles and times
  of those days in line (off by default, so an edit never overwrites a
  deliberately different day by itself). The button label follows suit
  ("Speichern und 2 Tage anpassen").
- A day inside the range that had been taken out of the plan earlier is now
  brought back instead of being skipped.

## [1.21.0] — 2026-08-26

The groundwork that unblocks the yearly-Excel wish and the board automation.

### Added
- **Drafts inbox** (`Projekte → Entwürfe`): everything arriving from outside
  becomes a draft first — *Übernehmen* loads it into the normal project form
  (name, address, dates, order value, description prefilled) and only saving
  makes it real; *Verwerfen* sets it aside. The project list shows a counter
  while drafts are waiting.
- **Excel import** (`Projekte → Excel-Import`): upload an .xlsx/.csv, map the
  columns once (project name required), preview the first rows and import —
  every row a draft. The mapping is **saved as a profile**, and a row with a
  mapped external id updates its draft on re-import instead of duplicating it.
- **Inbound endpoint** `POST /api/inbound/drafts` for automations, secured
  with a bearer key (`INBOUND_API_KEY`, endpoint off without it). The same
  external record updates its draft; fields a partial payload leaves out keep
  their previous value.
- **Source link on the project**: a project taken over from a draft keeps
  `externalSystem`/`externalId`/`externalUrl` and shows a *Quelle* link back
  to the origin.

## [1.20.0] — 2026-08-26

### Added — time tracking (from the meeting notes; legally required in the trade)
- **Start/stop on the phone**: the worker's assignment card carries a
  **Zeit starten** button; while running it counts along (*Stopp · 2:15*) and
  stopping books the interval on the project. Starting on another site closes
  the running interval first, and the day heading shows the day's total.
- **Office view and corrections** on the employee page: every booking of the
  last 14 days with day, from–to, duration, project and a *Büro* badge on
  office entries; delete and manual entry included. Intervals longer than 16
  hours (a forgotten stop) are refused.
- **Post-costing in the reports**: the *Projekte* tab shows the recorded hours
  per finished project and — with financial access — the order value per hour.
- Every interval carries a `source` (worker / office / import), so hours
  arriving from another system later land in the same table.

## [1.19.0] — 2026-08-26

Groundwork from the meeting notes — three things the recordings asked for
that never reached the item database.

### Added
- **Absences** (holiday, sick, other) on the employee page. The planner warns
  everywhere: the entry dialog marks an absent crew member with **⚠** and the
  absence type on the chosen day, and scheduling someone who is away shows up
  as a conflict in the week view, the month view, the multi-week overview and
  on the dashboard card.
- **Files on a project**: plans, offer PDFs and photos (PDF, images, Excel,
  Word · max. 25 MB) uploaded onto the project. Every file has a **Büro/Team**
  switch — new files are office-only, one click shares a file with the crew,
  and only shared files appear in the worker area. Files live under
  `FILE_STORAGE_DIR` (Docker: a volume at `/app/storage`); deleting a file
  removes it from disk as well. Every file carries a `source`, so files
  arriving later from a card, mail or AI extraction land in the same store.
- **Priority** (normal/high/low — high shows a red **!** in the project list)
  and **request source** (phone, e-mail, Instagram … — a configurable list in
  Settings) on the project.
- **Instruction-video link** on a catalog item: a play icon in the warehouse
  list and next to the item in the worker's packing list.

### Changed
- docker-compose mounts a named volume for uploads; the Dockerfile prepares
  `/app/storage`.

## [1.18.0] — 2026-08-24

### Changed — checklists belong to the projects now
- **The checklists moved from the settings to `Projekte → Checklisten`** and got the same shape as the project templates: a list with the number of points, in how many templates a list is used and whether it is active, plus its own create and edit page. Settings keeps a link.
- **A project chooses its checklists in its own form** (create *and* edit) — one or several. They are copied into the project on save, so every project can have exactly the lists its work needs.
- **A project template can carry checklists.** Every project made from that template starts with those lists.
- Settings no longer carries a checklist card at all — the one place for them is `Projekte → Checklisten`.
- Taking a list out of the project form removes it **only while nothing has been ticked**; as soon as the crew has ticked a point, the list stays on the project (`planChecklistChanges`, unit-tested).

Details and rollback: `docs/CHANGE-checklists-in-projects.md`.

## [1.17.0] — 2026-08-23

### Added
- **Seven more cards for the overview**, all switchable in *Ansicht anpassen*: **Einsätze morgen** · **Diese Woche auf einen Blick** (Mon–Fri side by side, today highlighted) · **Checklisten — gemeldete Probleme** with the note the crew wrote · **Diese Woche fällig** (overdue projects in red) · **Offene Angebote** with sum, count and waiting days · **Umsatz diesen Monat** against the previous month · **Bestand zu niedrig**. The two money cards are only built for accounts with financial access, and a hidden card runs no query at all.
- **Drag & drop on the overview:** in the edit mode a card can be dragged onto its place with the mouse; the order is saved right away. The ↑ ↓ buttons stay for tablets, where HTML5 dragging does not work.
- Planner → *Karte*: **the mouse wheel zooms** the map (it used to ignore the wheel).
- Settings → checklist templates: every template was shown fully open, so ten of them filled the whole page. Each is a **collapsed row** now (name · number of points · marked when inactive) that opens on click.
- Edit mode: every button of a card now carries its word (*Hoch · Runter · Halb/Voll · Ausblenden*) instead of an icon alone — the icons said nothing about what they do.

### Changed
- The stock-shortage list of the data quality report and the new dashboard card share one function (`getStockShortages`), so both always show the same items.

## [1.16.0] — 2026-08-23

Three more items from the customer backlog (meetings 1 + 2).

### Added
- **The overview can be arranged per person** (customer request M26): the button **Ansicht anpassen** turns on a small bar over every card — move it up or down, switch between half and full width, hide it. **Fertig** leaves the mode, **Standard wiederherstellen** resets it. The arrangement is stored on the user account, so everybody keeps their own overview.
- **Map of the day in the planner** (customer request M29): a fourth tab **Karte** next to Woche / Monat / Übersicht shows the sites of one day as numbered points, with the same list beside it (time, project, address, crew, vehicle, rain probability) and **← Heute →** to step day by day. Positions come from the project address; without exact coordinates the town centre is used and the entry is marked *ca. Ortsmitte*. Projects without a place are listed under the map. Map tiles come from OpenStreetMap — no account, no key.
- **Quarterly ring in the reports** (customer request M27): beside the monthly chart, Q1–Q4 as a circle with the year total in the middle — the "less table, more picture" the customer asked for.

### Fixed
- Reports → Übersicht: the order book showed **Angebote offen** with the label *Geplant / offen* and squeezed its four stages into three columns (since 1.14.0, when the offers stage was added).
- Reports, period controls: the years were out of order (2026, 2027, 2025 …) because the current year was pulled to the front as the "no filter" entry. It now keeps its place in the list (2027, 2026, 2025 …). The period list is grouped into **Quartale · Halbjahre · Monate** instead of one long flat list, and both selects sit in one small bar with a calendar icon — the same visual language as the view switcher in the planner.

## [1.15.0] — 2026-08-23

### Changed — the worker area is an app now, not a sheet (backlog M31)
- **Week strip**: the seven days of the week with a dot per assignment; tap a day, page whole weeks. The old single-day arrows are gone.
- **Slim header**: company mark plus one button with the worker's name — language, theme and sign out moved into that menu. The link to the warehouse screen was removed from the worker area (it is a wall-screen page with no way back); the shared warehouse login now gets that link on its own card instead.
- **Assignment card**: start time first, then project and customer; three big actions (navigation, call, work order); address, contact, vehicle and crew as icon rows.
- **The note of that day** (written in the assignment dialog) is shown in yellow at the top of the card — it used to be invisible for the crew.
- **Team-mates are tappable**: their phone number dials directly; the site manager is listed once, with their number.
- Day heading says how many assignments the day has; the empty day has its own card.

## [1.14.0] — 2026-08-23

### Added
- **Follow-on offers on a project** (customer request M24): extra work ordered later is booked with description, amount and date. It raises the order value on the project page ("50.000 € + 4.500 € = 54.500 €") and in every figure that uses it — revenue, order book, open offers, customer report, plan vs. actual. Only users with financial access can book one; every change is in the change log.
- Work order: the **site checklists are printed** with the sheet (☒ done, ! problem with its note, who ticked and when).
- Project list: a small badge shows how far the checklists of a project are ticked (⚠ when a problem was noted).
- Excel export: new sheet **"Offene Angebote"** with number, project, customer, days waiting and net value.
- Reports → data quality: **offers without an answer** for more than 21 days are listed for follow-up.

## [1.13.0] — 2026-08-23

Three items from the customer backlog (meetings 1 + 2).

### Added
- **Site checklists** (M22): reusable templates in Settings → Arbeitsbereiche ("Übernahme vom Vorgewerk" …), added to a project from a template or blank, ticked off on the phone: open → in order → problem. A problem takes a short note, and every tick stores **who** and **when**. Visible on the project page and in "Mein Bereich"; the crew may add a line on site.
- **Packing list on the worker's phone** (item 30): the tools/materials in "Mein Bereich" are now big tap targets (Benötigt → Gepackt → Fehlt) instead of a read-only list. Employees may only tick projects they are on the crew of or scheduled for; the warehouse screen shows a **QR code per assignment** that opens exactly that day's list on the phone (through the login, which now returns to the scanned page).
- **Open offers** (M23): the order book KPI splits into **Angebote offen** · Beauftragt · In Ausführung · Geplant, and a new report tab **Angebote** lists every offer waiting for confirmation — oldest first, with the days it has been waiting (flagged from 21 days) and the cumulated net volume.

## [1.12.0] — 2026-08-19

### Changed
- **The "to" date now shortens a range as well.** Opening an assignment prefills the field with the last day of that block, so 19.–29. can be changed to 19.–25.: the later days are taken out of the plan (reversible, nothing is deleted) and the dialog says how many. Days of a separate assignment later on are never touched — only the consecutive block (a weekend gap counts as consecutive).

## [1.11.4] — 2026-08-19

### Fixed
- Assignment dialog: the long label wrapped and pushed its field out of line. It is now short ("Weitere Tage" / "More days") with a small "(optional)" right beside it, and its column is slightly wider — the four date/time fields stay on one row in German, English and on the phone.
- The back button no longer returns **into a create or edit form**: after "new project → save → edit → cancel", back leads to the project list instead of the empty create page.

## [1.11.3] — 2026-08-19

### Changed
- "Bereitstellung heute": the button to the warehouse screen was removed — the page shows the packing status on its own, the kiosk is reached from the dashboard.

## [1.11.2] — 2026-08-19

### Changed
- Multi-week overview: **← and → page by the whole shown range** (6 weeks shown → 6 weeks back/forward, tooltip says so) instead of one week at a time.
- Weeks of another year carry the **year** — as a badge next to the week number and in the date range (e.g. "KW 1 · 2027 · 04.01.2027 – 08.01.2027"), so a range running over New Year stays unambiguous.

## [1.11.1] — 2026-08-19

### Changed
- Dashboard, "Heutige Einsätze": time, project and customer on the first line, vehicle and team as labelled rows underneath — much easier to read than one long line.
- The hint under the schedule now shows the copy shortcut with a key badge: drag = move, **Ctrl** + drag = copy on the new day.
- **"Projekt wieder öffnen" sits where you completed the project:** in the assignment dialog the green "Projekt abschließen" button turns into "Projekt wieder öffnen" once the project is done (the button on the project page stays as well).

### Fixed
- After completing a project the assignment dialog showed an **empty project field** — the picker only listed open projects. It now always contains the projects of the assignments on the board.

## [1.11.0] — 2026-08-19

### Added
- **Completing a project frees the following days:** when a project is finished earlier than planned, the confirmation asks whether the later planned days should be taken out of the schedule (ticked by default). Crew and vehicles are free again on those days — nothing is deleted, the days are only set aside.
- **"Projekt wieder öffnen"** on the project page (completed / invoiced / paid): the status goes back, the actual end date is cleared and the days that were set aside come back into the schedule.

### Changed
- Days taken out of the plan are invisible everywhere (week, month, overview, dashboard, warehouse screen, "Mein Bereich", reports, conflicts, status automation) and planning the same day again simply reuses that day.

## [1.10.1] — 2026-08-19

### Changed
- Assignment dialog: the extra-days field is now labelled **"Weitere Tage bis"** in edit mode and a row shows **all days the project is already planned on** (the day being edited is highlighted) — so non-consecutive days (e.g. Wednesday and Friday) are visible at a glance instead of being guessed from a range.
- The city suggestions of the place picker are rendered as an overlay: the "new customer" dialog no longer grows a scrollbar when the list opens.
- Adding a tool/material scrolls the picker back into view **on the template pages and in the project form** as well (previously only in the assignment dialog).

## [1.10.0] — 2026-08-19

### Added
- **Extend an assignment to more days:** open an existing assignment and set a *Bis* date — the following days are added with the same crew, vehicles and times (days that already have an assignment stay untouched).
- **Copy instead of move:** hold **Ctrl** (⌘ on Mac) while dragging an assignment onto another day and BauCrew creates a copy there — the project keeps its earlier day as well.

### Changed
- Planning looks forward: the **"+" button is hidden on past days** (week and month view), a new assignment cannot be dated before today, and the planned start/end of a *new* project cannot be in the past.

### Fixed
- **The shared warehouse account (`lager`) could not open work orders** of projects that were not scheduled within the next seven days — it is the kiosk account and may now print every work order (the sheet contains no prices). Personal employee accounts keep their own projects plus a 14/30-day window. The kiosk print button also passes the assignment, so the sheet shows that day's crew.
- Tools and materials show their **status colour again** (red "Fehlt", green "Gepackt") in the assignment dialog and on the project page.

## [1.9.0] — 2026-08-19

### Added
- **Configurable lists** (Settings → Arbeitsbereiche): client types (Privat, Gewerblich, Öffentlich …), building types (Neubau, Sanierung, Brücke, Straße …) and item kinds (Werkzeug, Material, Warnschild, Absperrband …) — rename, add, remove; suggestions are one click away. Details and rollback in `docs/CHANGE-configurable-types.md`.
- **Confirmation dialogs** in the app's own style (shadcn alert-dialog) instead of the browser popup — deleting anything, completing a project, restoring a backup.
- Templates: **back to the template list** on the create and the edit page; the tools/materials list now sits above the Save button on both.
- Site manager fields have an **✕ to clear** the selection (project, template, assignment dialog).

### Changed
- Company name, company colour and logo are now **one card** in Settings.
- Month view: the button reads **"Aktueller Monat"** and the current week's row is highlighted.
- Schedule: assignments of completed projects are **green with a ✓** in the week and month view.
- New customer (from the project form): the city field is the **place picker with weather recognition**, like everywhere else.
- Warehouse: the "Tagesvorbereitung" button was removed (the kiosk is reached from the dashboard).
- More air between the back pill and the page title.

### Fixed
- **Sign out** in the user menu did nothing (the menu closed before the form was submitted).
- Assignment dialog: the item picker now really **scrolls back into view** after adding a tool/material (the editor no longer unmounts while the list reloads).
- Selecting another site manager no longer **piles up crew ticks** — the previous manager is unticked, clearing the field removes the tick.
- Back button after "new template → cancel" returned to the create page instead of the project list.
- Template edit page contained a nested `<form>` (hydration warning).

## [1.8.0] — 2026-08-19

### Added
- **Company colour** (Settings → Allgemein → Firmenfarbe): pick the corporate colour and every button, active tab and highlight follows it — app-wide, light and dark.
- **Site manager in the assignment dialog** — choose it while planning; it belongs to the project, is saved right away and the person is ticked in the crew.
- **Templates carry an optional default assignment**: site manager, vehicles and crew are copied into a new project created from the template (`docs/CHANGE-template-assignment.md`).
- **Work order per assignment:** opening the sheet from the schedule, the packing overview or "Mein Bereich" now prints that assignment's crew, vehicles and date instead of the project defaults.

### Changed
- **All buttons share one style** (shadcn "button"): same height, radius, shadow, focus ring and disabled state — admin area, warehouse screen, employee area and login.
- **Pagination** shows page numbers with … gaps and labelled prev/next.
- **Sticky action bar** on the work order: "Zurück" and "Drucken / PDF" stay in view while scrolling.
- **Sidebar**: crew icon changed, company name under the logo, and language + theme moved into the user menu (top bar now only holds the mobile menu button).
- Assignment dialog: the item picker scrolls back into view after adding a tool/material.
- Charts got the shadcn treatment (dashed grid, rounded bars, hover); status dropdowns and date/time fields match the new controls.

### Fixed
- **Weekend switches are smart:** they only appear when the chosen date range really contains a Saturday or Sunday — and they are separate, so Saturday can be planned while Sunday stays free.

## [1.7.0] — 2026-08-18

### Changed
- **New look for navigation and controls, inspired by shadcn/ui:**
  - **Sidebar** with icons and two groups (*Betrieb* / *Stammdaten*); the signed-in user sits at the bottom as a button with avatar and role that opens a menu with *Einstellungen* and *Abmelden* — the settings entry is no longer a plain list item.
  - **Tabs** (project list, settings, reports, warehouse, schedule views) are a segmented control: subtle track, active tab as a raised pill.
  - **Comboboxes** show a chevron, a check mark on the selected entry and a "+" row to create a new item; the list is an overlay that never gets clipped.
  - **Selects** got the same frame, focus ring and chevron as the input fields.
  - **Settings** sections are cards with title and description.

## [1.6.0] — 2026-08-18

### Added
- **Several vehicles per project** (like assignments): the project form has a multi-select; every vehicle is prefilled when planning an assignment and printed on the work order. Data model change documented in `docs/CHANGE-project-multi-vehicle.md`.
- **Create a tool/material without leaving the form:** if the typed name is not in the catalog, the picker offers "„X“ als neuen Artikel anlegen" — a small dialog (name, tool/material, unit) creates it and adds it right away. Available on the project page, in the assignment dialog and on the new project / new template pages.
- **New template:** tools and materials can be picked before the first save — no more "save, then add items".
- Site manager is ticked in the team automatically when selected on a project.

### Changed
- **Sidebar is sticky** and carries the signed-in user, "Einstellungen" and "Abmelden" at the bottom; the top bar keeps only language and theme.
- Item pickers render their list in an overlay, so it is no longer cut off inside cards or dialogs and opens downwards whenever there is room.

## [1.5.0] — 2026-08-17

### Added
- **Stock shortage warning** (hint only, never blocks): when a project needs more of an item than the warehouse lists as stock, a yellow badge "⚠ Bestand 2 — 5 benötigt" appears next to the item — on the project page, in the assignment dialog, on the warehouse packing screen, the packing overview and in "Mein Bereich" (hidden once the item is packed). Reports → Data quality lists items whose stock is lower than the open demand of active projects (stock / demand, linked to the item). Items without a stock value never warn.

## [1.4.1] — 2026-08-17

### Fixed
- **Login failed for newly created employee accounts** when the username was typed with capital letters (e.g. auto-capitalised on phones): usernames are stored lowercase, but the login compared case-sensitively. Login now ignores casing; the login field also disables auto-capitalisation/auto-correct.
- Employee page: the "delete account" button was nested inside the account form (`<form>` in `<form>` → hydration error in the browser console). Moved outside the form.

## [1.4.0] — 2026-08-17

### Added
- **Assignments for several days at once:** the assignment dialog has "Von – Bis"; with an end date BauCrew creates one assignment per day (weekends skipped by default, toggle in the dialog, max. 31 days, live count on the button). Days on which the project already has an assignment are left untouched. Also available from the project page ("Einsatz planen").
- **Settings page in tabs:** Allgemein (company, logo, weather, project-list tab) · Benutzerkonten · Arbeitsbereiche · Daten & Protokoll (backup, import, change log).
- **Change log for the owner:** actions and areas in plain language ("Einsatz verschoben", "Projektstatus automatisch geändert" …), status/role/packing values translated, technical key as tooltip; two clear buttons ("Älter als 90 Tage löschen", "Protokoll leeren", both with confirmation, the clearing itself is logged).
- **Configurable combined tab** on the project list (Settings → Projektliste – Sammel-Tab): show/hide, custom name, included statuses, optionally only projects without any assignment. Default renamed to **"Zur Vorbereitung"** (Anfrage + Angebot + Beauftragt).

## [1.3.1] — 2026-08-17

### Changed
- Month view shows up to 5 assignments per day; the "+N weitere" expander is now a visible dashed pill.
- Mobile: week, month and overview headers wrap cleanly (arrows + "Aktuelle Woche" stay grouped, weekend toggle and week selector no longer overflow the screen).

## [1.3.0] — 2026-08-17

### Added
- **Month view is now interactive:** click a chip to open the assignment dialog, "+" on any day to create, drag & drop (mouse and touch) to move — same as the week view; "+N" expands the day.
- **Multi-week overview:** choose 4 / 6 / 8 / 12 weeks (default 6).
- **Weather sensitivity setting** (Settings → Wetterwarnung): rain-probability threshold in %, default 60, with a hint about the source (Open-Meteo / DWD ICON, up to 16 days). Used by dashboard, scheduling and data quality.
- **Smart back button:** the ← pill on detail and sub pages returns to the page you actually came from (e.g. packing overview → project → back to packing); opened directly or from its own list, it still links to that list.
- **Audit log page** (Settings → Änderungsprotokoll, administrators): every change with time, user, action, area and old → new value; live search and area filter; links to the changed record.
- Dashboard sub page **"Bereitstellung heute"** (`/dashboard/packing`): packing status per assignment and item, day navigation, work-order (print) button per assignment — the dashboard card links there (the warehouse kiosk stays one click away).

### Changed
- Dashboard card links ("Zur Einsatzplanung", "Zur Bereitstellung") styled as small pills.

## [1.2.1] — 2026-08-16

### Fixed
- Assignments on Saturday/Sunday were invisible in the week and month views (Mon–Fri only). Both views now add the weekend columns automatically when an assignment falls on them; the week view also has a "+ Wochenende" toggle to open the columns by hand, and the assignment dialog warns when a weekend date is chosen.

## [1.2.0] — 2026-08-16

### Added
- **Automatic project status:** creating the first assignment moves a project from Lead / Quoted / Ordered to **Planned**; when the first assignment day arrives, a Planned project becomes **In progress** and *Start (actual)* is filled with that day. Setting a status by hand (quick status or edit form) fills empty *Start/End (actual)* from the schedule (first day / last day up to today). Never moves backwards; every change is audited as `project.status.auto`.
- **"Complete project" in the assignment dialog:** marks the project Completed, sets *End (actual)* to that assignment's date and *Start (actual)* to the first assignment day (when empty).
- Dashboard sub page **"Working today"** (`/dashboard/today`): one row per employee and per vehicle with the project(s), times and place next to it; day navigation; the dashboard cards "employees / vehicles today" link there instead of the warehouse screen.
- Consistent **back button** (pill with ←) on all detail pages (project, customer, employee, vehicle, templates, Trello import, work order).
- Project list: new **Preparation** tab (Lead + Quoted + Ordered — nothing planned yet).

### Docs
- German and Persian user manuals rewritten for beginners (18 chapters, 38 screenshots), covering every feature of 1.2.

## [1.1.0] — 2026-08-16

### Added
- Employees: skills are entered as chips with live suggestions from existing skills and a "create „X“ as new skill" entry (Enter/comma adds); a collapsible **Manage skills** box on the employees page renames or removes a skill across all employees.
- Warehouse: the category field is now free text **with live suggestions** from existing categories and a "create „X“ as new category" entry; a collapsible **Manage categories** box on the warehouse page renames a category across all items or removes it (items become uncategorised).

### Changed
- New project: the "Tools and materials" section is always shown (empty and collapsed without a template, prefilled from a template) so items can be entered right away.

## [1.0.2] — 2026-08-16

### Added
- **Vercel support** without touching the Docker flow: `npm run build` now runs `prisma generate` first (the generated client is not committed), and — only when `VERCEL` is set — `prisma migrate deploy` + base-data bootstrap against `DATABASE_URL` before `next build`. Docker keeps doing both at container start. Docs in DEPLOYMENT.md.

## [1.0.1] — 2026-08-16

### Docs
- Complete new German user manual (`docs/BENUTZERHANDBUCH.md`, 19 chapters) covering every feature of 1.0 — customer-address takeover, city picker, template items, reports tabs, account management, admin/install chapter.

### Changed
- UI locales: German + English shipped; extra test locales are local-only via `NEXT_PUBLIC_EXTRA_LOCALES`.

## [1.0.0] — 2026-08-16

First release.

### Core
- Central **Project** record (auto number `YYYY-NNNN`, 9 statuses, SUB flag, categories, address, dates, price, manager, team, vehicles, items, notes) — every other screen derives from it.
- Customers, employees (skills, partial skill search), vehicles (status), tool/material catalog, project templates.
- Custom session auth (bcrypt, hashed tokens, httpOnly cookie, 30 days) with roles **Admin / Office / Employee** and per-user financial access; all authorization server-side.
- Full audit log.

### Scheduling
- Week, month and multi-week overview; drag & drop with mouse and touch (long-press).
- Entries with start/end time, several vehicles per entry, notes.
- Conflict detection (same employee/vehicle, same day, overlapping times; vehicle not available) — warnings, never blocking.
- Weather warnings for outdoor categories (Open-Meteo, no API key).
- "Plan assignment" from the project page with prefilled team, vehicles and times.

### Warehouse & field
- Per-project packing lists (required / collected / missing), warehouse kiosk board with auto-refresh and shared `lager` account.
- Printable **work order** (A4) with logo and QR code; opens in the same tab with a back button; no prices.
- **My area** for employees: day navigation, maps/call links, packing list, next job — mobile-first.

### Administration
- Settings: system accounts, overview of privileged accounts (admins / financial access), company name, logo upload, work categories, JSON backup & restore, Trello import.
- **Employee user accounts are managed on the employee page** (activate, username, password, role, financial access, deactivate); Settings lists only accounts without an employee.
- Reports: yearly revenue (own vs. SUB), utilization, Excel export.

### UX
- German (default) + English UI via next-intl; light / dark / system theme.
- Live search everywhere, searchable pickers with inline create, status tabs, pagination, quick status badges, mobile drawer navigation, transient "Saved ✓" feedback.

### Ops
- Dockerfile + docker-compose (app + PostgreSQL), automatic `prisma migrate deploy` on start.
- Vitest unit tests (conflicts, dates, pagination, authz, Trello import) and DB-backed report tests.
- User manuals in German and Persian.

### Reports and analysis
- **Period selector and analysis tabs:** period selector now offers whole year, quarter (Q1–Q4), half-year (H1/H2) or a single month; new tabs **Customers** (revenue share per customer with >30 % concentration warning, customers without a project for 12+ months), **Utilization in %** (assignment days ÷ working days of the period; <50 % / >90 % highlighted), **Data quality** (in-progress projects without upcoming assignments, completed projects without price, projects without city, items missing in several projects — each linked); **Print / PDF** button; Excel export gets a Customers sheet and follows the selected period.
- **KPIs, chart and plan vs. actual:** KPI cards (year-to-date revenue with % vs. the same months of the previous year, SUB share, open order book split into ordered / in progress / planned), a monthly revenue chart with the previous year as reference, and a **plan vs. actual** table for completed projects (planned working days, actual schedule days, person-days, revenue per person-day, end delay) — also as a third sheet in the Excel export. The page is organised in tabs (Overview · Revenue · Projects · Utilization) with year and month selectors that filter every tab and the export.

### Data entry
- **Site address from customer:** on a new project, selecting a customer with an address ticks "Same as customer address" and copies street / postal code / city / phone (read-only); untick to enter a different site address (fields cleared), tick again to restore. Edit mode never overwrites an existing address.
- **City picker with geocoding:** the city field (projects and customers) suggests real places while typing (Open-Meteo, Germany); picking one stores the canonical name plus coordinates (`latitude`/`longitude`, new migration) and fills an empty postal code. Status line: "✓ place recognised — weather data available" / "⚠ place not found". Weather lookups use stored coordinates when present (exact and cached), otherwise geocode by name. New data-quality check: active projects whose typed city cannot be located.
- **New project from template:** collapsible "recommended tools and materials" section — remove or add items before saving; the saved list is exactly what was shown.
- Template edit form shows "Saved ✓" instead of silently reloading.

### Accounts and operations
- **Delete user accounts** (Settings → system account page, and the employee's account section) with two guards: you cannot delete the account you are signed in with (sign out, sign in as another administrator, delete from there), and the last active administrator can never be deleted. Sessions are removed; audit entries are kept.
- **Zero-touch first start in Docker:** the container bootstraps base data (system accounts, work categories, catalog) automatically when the database is empty (`scripts/bootstrap.mjs`, data in `prisma/seed-data.json`, shared with `npm run db:seed`).
- Base seed / Docker bootstrap no longer create the redundant `manager` account — system accounts are `admin`, `buero`, `lager`.

[1.15.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.15.0
[1.14.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.14.0
[1.13.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.13.0
[1.12.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.12.0
[1.11.4]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.11.4
[1.11.3]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.11.3
[1.11.2]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.11.2
[1.11.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.11.1
[1.11.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.11.0
[1.10.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.10.1
[1.10.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.10.0
[1.9.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.9.0
[1.8.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.8.0
[1.7.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.7.0
[1.6.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.6.0
[1.5.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.5.0
[1.4.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.4.1
[1.4.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.4.0
[1.3.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.3.1
[1.3.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.3.0
[1.2.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.2.1
[1.2.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.2.0
[1.1.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.1.0
[1.0.2]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.0.2
[1.0.1]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.0.1
[1.0.0]: https://github.com/mostafasadeghidev/baucrew/releases/tag/v1.0.0
