# Changelog

All notable changes to BauCrew are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **The menu folds.** The button beside the logo — or Ctrl/⌘ + B — takes the
  sidebar down to a rail of icons and gives the page back a hundred and
  seventy-six pixels; a table that had to wrap now fits. Each icon says its
  name in a tooltip that appears at once and is not cut off by the scrolling
  nav around it. The choice is kept in a cookie, so the server already knows it
  and the page arrives at the width it was left at instead of snapping to it
  after it has been painted. On a phone the menu is the drawer it always was.

### Added
- **Folgewoche.** A toggle beside the weekend one puts the week after this one
  underneath it: two grids, same columns, Monday under Monday. A card drags
  from any day to any other, whichever of the two weeks it is in — a drop only
  ever carries a date. The arrows then step a fortnight at a time, the heading
  reads *KW 32–33*, and each grid says which week it is. Both weeks share one
  weekend decision, or the columns of the second would not line up with the
  first. The choice rides in the address with the week and the weekend, and
  every link on the board now carries all three: stepping a week used to close
  the weekend columns again behind you.

### Removed
- **The Übersicht view is gone** from Einsatzplanung. Woche, Monat and Karte
  remain. What it did — several weeks one under the other — comes back inside
  the week view, where it belongs, rather than as a fourth tab nobody opened.
  A bookmark to it lands on the week board.

### Changed
- **One header for all three scheduling views, in two rows.** The views sit on
  the first row, the period and its controls on the second. It was hand-copied
  three times with three different conventions, and it moved: the weekend
  control disappeared entirely on a week that already had a Saturday
  assignment, sliding everything beside it about 133px sideways, and between
  roughly 890 and 1020 pixels the row wrapped and pushed the board 40 to 80
  pixels down. Now neither row wraps, both keep their height, the weekend
  control is always drawn — locked, when the week's own assignments hold it
  open — and a toggle keeps its word whichever way it stands, so it cannot grow
  under the cursor that clicked it. The stepper closes the second row, right
  under the switcher, with the toggles queued to its left: nothing stands to
  its right, so the arrows are in the same place in the month, which has no
  toggles, as in the week, which has two. Its middle button says **Aktuell** in
  every view — "Aktuelle Woche", "Aktueller Monat" and "Heute" were three
  widths of the same button.
- **The week board stops moving under the cursor.** The conflict and weather
  boxes above the calendar grew and vanished with the week, so paging from a
  week that had warnings to one that had none lifted every day column up the
  page. They are one line now, always there and always the same height: a
  counter for each, and the list behind a click, in a menu over the board
  rather than under the line. A week with nothing to report says so. The ⚠ on
  the entries themselves — where the work is — is unchanged.

## [1.35.0] — 2026-09-08

### Added — the revenue tab holds three views
- **Monate** is the tab as it was: one card per month. Beside the period total
  it now has an order, so an office that wants the running month first can
  turn the year around. Only the display turns — every sum, the chart, the
  quarter ring and the Excel export keep reading the months in calendar order.
- **Top-Baustellen** folds the month lines of one project into the job the
  office actually talks about, largest first, with its share of the period. A
  site only the planning sheet knows is folded by name and has no page to
  open; a line without an amount counts as zero rather than disappearing.
- **Kumuliert** adds the year up month by month beside the same months of the
  year before — whether the year is running ahead, and since when. Counting
  starts at the first month of the chosen period, so a quarter compares
  against that same quarter.

### Added — the monthly chart in four shapes
- The picker beside the heading, each shape with the picture of itself next to
  its name, draws the same figures as **Balken** (as ever), as a **Kurve** —
  one rounded stroke a year — as a **Linie**, straight from month to month, or
  as a **Fläche**, the rounded stroke with its ground shaded under it. Rounded
  reads as a trend, straight reads as the twelve figures it is made of. A curve has room for one figure a month, so in
  those two the split between own crew and SUB leaves the picture and the
  bubble gives each year's total instead. Lines carry four or five years where
  areas begin to muddy each other; an area suits the usual pair. The shape and
  the years it compares sit side by side above the chart and wrap as one.
- A curve breaks where a run of months has nothing in it rather than diving to
  the floor: a year booked only to September earns nothing afterwards, it does
  not earn zero. Pointing at a month sets a dot on every curve, and choosing a
  period steps the months outside it back exactly as it does with bars.
- The rounding is a monotone spline: between two months it stays between their
  two figures, so no stretch of it claims a figure the year has not got. The
  ordinary spline it replaced overshot by up to an eighth of a rise — above the
  topmost gridline, where the chart's own frame cut the peak off flat — and
  dipped below the axis into revenue nobody billed. The geometry lives in
  `src/lib/chart-path.ts` with tests that sample the drawn curve and hold it
  inside the data.

### Added — as many years in the monthly chart as fit
- The **Monatsumsatz** card compares against the year before as it always did.
  **Vergleichsjahre** beside the heading opens a list of years, each with a
  tick: up to five stand beside the one on screen — every year the picker
  offers. Every year is split the way
  the year on screen is — solid foot for own crew, pale head for SUB — and
  every one has a colour of its own rather than a fainter grey, because four
  greys stop telling each other apart on a dark screen.
- Inside a month the bars run newest year to oldest with the year on screen in
  its place, so a year picked *after* it stands to its left instead of behind
  it. The legend runs in the same order.
- What the bubble says depends on how much is in the chart: with one compared
  year the whole month answers, as it always did; from two on a bar answers
  for itself and the strip carrying the month name gives every year at once,
  one line each, separated by a dashed rule. The bubble always goes to the far
  side of the month in hand, so it never covers what it is describing.
- Beside each compared year the bubble says how far the year on screen stands
  above or below it in that month, under a head naming what that is measured
  against — **vs. 2026**. The card *Umsatz je Jahr* under the chart measures
  the other way round, every year against the one before it, and now says so
  too: **ggü. Vorjahr**. Two arrows that look alike had meant two different
  things without either saying which. The ⓘ on the chart's heading spells the
  difference out.
- The choice rides in the address like the year and the period, so a
  comparison survives a reload and can be sent as a link, and an empty choice —
  the year entirely on its own — is a choice the app keeps. The months come
  from the aggregate the year comparison already loads, so a fourth year costs
  no query.

### Fixed
- A chart is twelve tab stops again, not sixty: the strip under each month
  takes the keyboard and reads out every year in it, and the focused month is
  now outlined instead of merely tinted. A mouse crossing the chart no longer
  wipes out what the keyboard put up.
- The bars answer for themselves. The catch column of each bar is cut from the
  bar's own place rather than from an even split of the month, so the outermost
  bar of a month can no longer report its neighbour's year, and taking a year
  away while the pointer rests on the last bar falls back to the whole month
  instead of throwing.
- A gridline at 2 500 € is labelled 2,5 T€ rather than 3 T€.
- The pale SUB head of a compared bar is visible on a white card again — it had
  been the colour of the gridlines.
- The Vergleichsjahre button is left off the printed report, and ticking a
  second year before the first has landed no longer drops the first.
- A menu opened from the keyboard puts the keyboard inside it, and Escape hands
  the focus back to the button that opened it.

### Added — several years side by side
- **Umsatz je Jahr** under the Übersicht tab: one bar per year, own crew and
  SUB apart, newest first, with the change against the year below it. Every
  row is a link that makes that year the selected one. A year with nothing in
  it is left out. The figures come from the loader the month cards read, so
  the comparison and the months can never disagree about a year.

### Changed
- **The back gesture leaves the page, not the tab.** A tab and a page number
  are two views of one page, so both replace the history entry instead of
  adding one — clicking through the seven report tabs used to leave seven
  stops behind, and a two-finger swipe undid them one at a time. The app's own
  "← Zurück" pill steps back now instead of pushing the remembered page
  forwards.
- **A page stops repeating the menu it is under.** From md upwards the heading
  that said "Projekte" beside a sidebar already saying Projekte steps out of
  sight; below md it stays, since there the sidebar is folded away. It remains
  in the document for screen readers, and the printed report carries a title
  of its own. Einstellungen keeps its visible heading — it is reached from the
  user menu, not the sidebar.
- **The Umsatz tab explains itself only when asked.** The grey paragraph
  across the top moved into the ⓘ beside the heading; the months start at the
  top of the page now.

## [1.34.0] — 2026-09-08

### Changed — the revenue chart answers where the cursor is
- **Monatsumsatz chart (Berichte → Übersicht).** Pointing at a month now
  shows every figure of that month at once — SUB, own crew, the total, the
  planned figure and the previous year — in a card of the app's own, and it
  appears at once instead of after the browser tooltip's second of silence.
  The whole column is the target, not an eighteen-pixel bar, and it answers
  a tap and a keyboard as well as a mouse, which the old one never did.
- Bars are rounded at the top only. A stacked column reads as one bar, the
  seam between own crew and SUB is a straight line rather than two clipped
  corners, and every bar sits flat on the axis.

## [1.33.0] — 2026-09-07

### Added — where the old data ends
- **Einstellungen → Daten → Altdaten.** The office names the day from which
  BauCrew is kept. Work finished before it is old data: still there, still
  counted wherever the figures come from the planning sheet, but no longer
  chased. *Datenqualität* stops asking such projects for a start date or an
  order value, and the *Ohne Termin* card leaves them out — both say how
  many they set aside, so nothing looks swept away. Left empty, everything
  is asked about exactly as before.

### Changed
- **Data quality asks only what somebody can answer.** A start date is asked
  of work that is planned, under way or done — an accepted offer nobody has
  scheduled yet has no date to give, and it is still listed on the revenue
  tab under *Ohne Termin*. The town is asked for the same work, since only
  scheduled days get a weather warning. Both lists can now be finished.
- **"Geplant, aber noch kein Projekt" is a task list again.** It shows the
  sheet's sites for this month and the ones ahead — work that still has to
  become a project. Once nothing is ahead, one quiet line says how many
  lines from earlier months have no project and links to the plan match,
  which is where that record belongs.

## [1.32.0] — 2026-09-07

### Added — a door for programs and assistants
- **API keys** (Einstellungen → Daten → Schnittstelle). An administrator
  makes a key for one office account; the key acts as that user — same
  role, same financial access — is shown once, and can be revoked. Every
  write through it lands in the change log.
- **JSON API** under `/api/v1`: projects (list, one, create, status),
  customers (list, create), employees, vehicles, the schedule (list, plan
  a day or a range), revenue by month and the plan gaps (financial access).
  Price fields are absent for a user who may not see them. `docs/API.md`
  describes every route.
- **MCP** at `/api/mcp`: the same functions as tools for an AI assistant
  (Claude Code, Claude Desktop via mcp-remote, any client that speaks
  Streamable HTTP). The server introduces the app, its date and money
  conventions and the rule to confirm before writing.

### Changed
- Putting a project on the board and drawing the next project number live
  in the library now, so the dialog, the API and the assistant do exactly
  the same thing.

### Fixed
- **The backup is whole again.** Since the year plan, checklists, add-ons,
  devices, time entries, absences, drafts and API keys arrived, the backup
  from the settings had carried only the older tables, and a restore
  silently lost the rest. It now holds every table (a test holds the list
  against the schema) and the documents' files, and a restore replaces
  everything with it — which is how an installation moves from a test
  server to the real one.

## [1.31.0] — 2026-09-06

### Added — the plan match finishes what a person started
- **Jobs over New Year are one job.** A site still going in November or
  December and picking up in January or February is one row with one span
  (*Nov 2025–Feb 2026*) and one sum, not two halves in two years.
- **Phases go together.** A customer whose jobs no other project could be,
  a few months apart and named with nothing but the project's own words
  (*Innenputz* in November, *Maler* and *Fassade* in spring), has one project
  doing them in phases — that project takes them all. Not for a council or a
  school, whose "jobs" are different buildings; not for two people who share
  a surname. A project already tied to lines takes the phase next to what it
  has, and keeps a namesake from taking it.
- **Sure means sure, decided better.** Dates rule out what they can: a job
  that was over months before its card existed, and a job still ahead for
  work that is finished. Ties are broken by wording (*Restarbeiten* goes to
  the card that says so); once a job is surely taken, another project may be
  left with one, and gets it. A job named with a project's whole name is that
  project's. A name that is nothing but a first name is read as the surname
  it is; a street without its ending (*Muster* for *Musterstraße*) as the
  street.
- **Links as a file.** *Zuordnungen exportieren* writes every link to a
  file; *importieren* applies it on another installation — a line is found
  by year, month, wording and amount, a project by the board card it came
  from or by its number and name. Decisions made once are not made twice.
- **Zusammenführen** on the project page (admins): a project entered twice
  is folded into the one kept — assignments, team, vehicles, material,
  lists, files, notes, times and plan lines move over, gaps in the master
  data are filled from the other, the board card's identity comes along so
  the next import updates the kept project, and the other is deleted. An
  assignment on a day the kept project already has stays behind and is
  reported.

- **The sheet is the record.** For a year with an imported planning sheet
  the revenue report now shows the sheet's lines, month by month and amount
  for amount — the office's own turnover record — instead of projects filed
  under their start month. A line tied to a project links to it; a line
  without one is the sheet's line. Projects the sheet does not know stand
  beside their month under *Nicht in der Tabelle*, listed but not counted,
  so the months add up to the sheet. The Excel export does the same. A year
  without a sheet is still built from projects. The year-over-year
  comparison and the dashboard's *revenue this month* read the same
  figures.
- **The month cards explain themselves.** *Eigene Leute*, *SUB* and *Nicht
  in der Tabelle* each carry a small ⓘ that says what the figure is; a
  notice above the months names the source.
- **Month cards line up.** Cards beside each other share their rows: the
  *Eigene Leute* line, the *SUB* line and *Nicht in der Tabelle* sit at the
  same height in every card of a row, however long the lists above them
  are, so months can be read across. A month without SUB work shows the
  SUB line as a dash.

### Changed
- A figure the sheet gave a project grows when a further phase is tied to
  it: an earlier start, a later end, the amounts added up. The note on the
  project records each step, and a figure the office typed in is still
  never touched. Untying a project's last line takes back exactly what the
  notes say the sheet gave, and drops the notes, so a year's links can be
  cleared and the matching started over without figures left behind. The
  project picker on the plan page offers every project, not only the ones
  without a line.
- The plan page's figures are the year's alone; a row may show a job that
  runs beyond it.

## [1.30.0] — 2026-09-06

### Added — the planning sheet and the board, stitched together
- **Berichte → Planabgleich works on jobs, not lines.** The sheet's lines are
  folded into jobs first (same site, same year, the months it spans, the
  amounts added up), so a job that runs from March to May is one row with one
  sum, and linking it hands the project its **start, end and order value** in
  one go — only where the project has none, so nothing typed in by the office
  is overwritten. The description records what came from the sheet.
- **Automatic reconciliation.** One button ties every job to its project
  wherever the match is sure, and reports how many were applied, how many
  need a decision and how many fit nothing. "Sure" is strict on purpose:
  work words (*Fassade*, *Innenputz*), first names and words like *Gemeinde*
  never carry a match; two names that both have two identifying words must
  share two; a single shared word must be the customer's own name; a job two
  projects both claim goes to neither; and a project can only match a job of
  its own year or the next (the card's creation year — the importer now keeps
  it as `sourceCreatedAt`). The office's habit of shortening a town to its
  first letter and ending (*Mbach*) is understood.
- **The rest is offered, never applied:** every open job lists the projects it
  could belong to, ✓ for the one the matcher would pick, ? for the others.
- **Datenqualität checks for a missing planned start** — the one gap behind
  every wrong month figure, which no tab reported until now.

### Changed
- **A project without a planned start belongs to no month.** The revenue tab
  used to file it under the month it was typed in, which after a board import
  piled two hundred projects into one month. Such projects are now listed on
  their own under *Ohne Termin* with their sum, and count in no month and no
  year total until a date is set.
- The comparison with the previous year says so when that year comes from
  the sheet rather than from projects.

## [1.29.0] — 2026-09-05

### Changed — the Trello import survives a second run
- **The job number in a card title is now the project's identity.** Titles end
  with the number the office's other systems use (`Musterhof Innenausbau
  (4100001)`); it is read out, stored as the external id, and the card link is
  kept as the source. Importing the same board again therefore **moves the
  projects on instead of doubling them**: cards that changed list get the new
  status, and the result says how many were created and how many updated.
  Projects from an earlier import are adopted by name once, so the board and
  the project list line up from then on.
- **The customer is read properly.** The first word is still the customer for
  the usual `Nachname Vorname Ort` title, but a qualifier (`HV Musterhof`,
  `BV: Musterhof …`) is skipped to the name behind it, an institution keeps its
  place (`Gemeinde Musterdorf`), and trailing punctuation no longer ends up in
  the name. A title that names a building rather than a customer
  (`Kläranlage …`) keeps its full title instead of filing unrelated jobs under
  one invented customer, and the import reports how many such cards need a look.
- **Attachments are no longer lost:** every file on a card is listed with its
  link in the project description.
- **"Baustellenbeginn" now means planned**, not in progress, and the
  `Auftrag`/`Aufträge` umlaut no longer sends a whole column to the wrong status.

### Fixed
- **A real board could not be imported at all.** A Trello export of ~250 cards
  is about 2.5 MB and the default 1 MB server-action body limit rejected it
  before the importer saw the file. The limit is raised to 12 MB and the
  wizard's own cap now matches it instead of promising 50 MB.

## [1.28.0] — 2026-09-04

### Changed — the years before BauCrew become the company's history
The planning spreadsheet is not only a plan: for the years the company worked
before this app existed, it is the only record of what was done each month.
Those years now stand on their own figures instead of being held against
projects that were never entered.

- **A year with no project at all but an imported plan is read from the sheet:**
  its month cards list the sites with their amounts, split into own crew and
  SUB exactly as the sheet does, and the year total is the sheet's total.
- **The year-on-year comparison finally works.** The grey previous-year bars in
  the monthly chart and the "vs. last year" figure were empty for the first
  year of use, because last year had no projects. They now carry the sheet's
  history.
- The source is named on the page, and such a year shows no plan/actual
  difference and no gap list — there is nothing to compare it against.
- Entering a single project for such a year switches it back to live figures
  on its own; there is no setting to get wrong.

Utilisation, customers, project efficiency and data quality stay project-based
and remain empty for those years — inventing numbers there would be worse than
leaving them blank.

## [1.27.1] — 2026-09-04

### Fixed
- **A year from before BauCrew no longer reads as a disaster.** Importing the
  whole spreadsheet brings in years the company ran on paper, where a plan
  exists but no project was ever recorded. Every month then showed the full
  planned sum as a shortfall. Such a year now shows the planned figures alone,
  with one line saying that no projects are recorded for it — the plan/actual
  comparison starts with the year BauCrew has been in use.

## [1.27.0] — 2026-09-03

### Added — the planning sheet and the projects, tied together
- **Berichte → Umsatz now names the gaps:** *Geplant, aber noch kein Projekt* —
  the planned sites of the year that no project carries yet, with their sum.
  The honest answer to "what did we promise that never reached the system?".
- **Berichte → Planabgleich** (new page): every line of the year for the chosen
  year with a project picker, the plan and the order value side by side, and
  counters for planned / linked / still open.
- **Suggestions, never guesses.** The matcher compares the identifying words of
  both sides — trade words like *Fassade* or *Innenausbau* can never carry a
  match on their own — and the month only breaks a tie. Anything unclear, or
  where two projects are equally close, is left alone. *Alle Vorschläge
  übernehmen* applies the sure ones at once; one project is never offered twice.
- **The project page shows *Planumsatz*** with the difference to the order
  value — green once the order reaches the plan, amber below it.

### Changed
- **A re-import keeps the links.** A year is still replaced as a whole, but the
  links to projects are carried over by month and name and the result says how
  many survived — otherwise every re-import silently undid that work.

## [1.26.0] — 2026-09-03

### Added — the year planning sheet, read as it is
- **Einstellungen → Daten → Jahresplanung importieren.** The monthly planning
  spreadsheet can be read straight in, in the shape such sheets actually have:
  one worksheet per year, the months **next to each other** as blocks with a
  *Baustelle* and a *Planumsatz* column. The subtotal lines are understood —
  everything below *Eigene Leute* counts as **SUB**, even where the caption
  cell is empty — and a *Baustellen für &lt;Jahr&gt;* column is kept as sites
  promised without a month.
- **A preview before anything is written:** every year found is listed with its
  rows, own-crew and SUB sums and total; years can be unticked. A year is then
  replaced as a whole, and the preview says beforehand how many existing rows
  that costs. Stored years are listed on the page and can be deleted one by one.
- **A month block whose month cannot be read is skipped rather than guessed** —
  a gap is better than a wrong figure.

### Changed
- **Berichte → Umsatz** shows the **Plan** and the difference under every month
  card and for the whole period — green once the plan is reached, amber below.
- **The monthly chart** carries a dashed marker per month at the planned level.
- **Sites parked on a year without a month** (the sheet's *Baustellen für
  &lt;Jahr&gt;* column) get their own line under the revenue heading — they
  belong to no month card and were invisible before.

## [1.25.0] — 2026-08-27

### Changed — devices sit where the tools already sit
- **The project page and the assignment dialog carry the same device block as
  tools and materials**: a picker at the bottom to add one, a ✕ per row to take
  it off the list, and per row a green or red dot with where the machine is
  (*im Lager* · *ist hier* · the other site). A free one shows **Jetzt
  ausgeben**, one standing here shows **Zurücknehmen** — no detour over the
  device page any more. What is actually on the site is listed underneath.
- **The template has its own card** for the standard machines of that kind of
  job, next to the recommended tools instead of squeezed between other fields.
- **The warehouse page answers "who has it?"**: a card at the bottom lists every
  device that is not in the store, with the site or the person and how long it
  has been out.

## [1.24.0] — 2026-08-27

### Added
- **Devices needed, on templates and projects.** A template carries the
  standard machines for that kind of job and a new project takes the list
  over. The list says what is *needed*; it books nothing — handing out stays
  one physical act with one holder.
- **The project page shows both sides:** what the job needs (with green/red for
  where each machine is right now) and what is actually standing on the site.
- **Green or red while planning.** The assignment dialog lists the project's
  needed devices with their state; a free one carries **Jetzt ausgeben** and is
  booked onto that site with one click, a busy one says where it is instead of
  being assigned silently.

## [1.23.0] — 2026-08-27

### Added
- **Devices and machines** (`Geräte` in the menu) — one row per physical unit,
  with inventory number, kind, storage place, notes and a link to a short
  instruction video. The list says for every device whether it is **in the
  store** (green) or **on a site / with a person** (red), and the search covers
  name, number, kind and place, so a device is found by any of them.
- **Hand out and take back.** A device goes to a site or to an employee; while
  it is out nobody can hand it out a second time, and the history keeps who had
  it when. The project page carries a card **Geräte auf dieser Baustelle**, so
  an interrupted site does not hide what is still standing there.
- Availability is never stored — it is read from the open handout, and every
  device row carries `externalSystem` / `externalId` / `source` so a later sync
  with an outside equipment system fills these same tables instead of
  replacing them.

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

Groundwork for spreadsheet import and inbound automation.

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

### Added — time tracking (legally required in the trade)
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

Groundwork for three things that never reached the item database.

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


### Added
- **The overview can be arranged per person**: the button **Ansicht anpassen** turns on a small bar over every card — move it up or down, switch between half and full width, hide it. **Fertig** leaves the mode, **Standard wiederherstellen** resets it. The arrangement is stored on the user account, so everybody keeps their own overview.
- **Map of the day in the planner**: a fourth tab **Karte** next to Woche / Monat / Übersicht shows the sites of one day as numbered points, with the same list beside it (time, project, address, crew, vehicle, rain probability) and **← Heute →** to step day by day. Positions come from the project address; without exact coordinates the town centre is used and the entry is marked *ca. Ortsmitte*. Projects without a place are listed under the map. Map tiles come from OpenStreetMap — no account, no key.
- **Quarterly ring in the reports**: beside the monthly chart, Q1–Q4 as a circle with the year total in the middle — less table, more picture.

### Fixed
- Reports → Übersicht: the order book showed **Angebote offen** with the label *Geplant / offen* and squeezed its four stages into three columns (since 1.14.0, when the offers stage was added).
- Reports, period controls: the years were out of order (2026, 2027, 2025 …) because the current year was pulled to the front as the "no filter" entry. It now keeps its place in the list (2027, 2026, 2025 …). The period list is grouped into **Quartale · Halbjahre · Monate** instead of one long flat list, and both selects sit in one small bar with a calendar icon — the same visual language as the view switcher in the planner.

## [1.15.0] — 2026-08-23

### Changed — the worker area is an app now, not a sheet
- **Week strip**: the seven days of the week with a dot per assignment; tap a day, page whole weeks. The old single-day arrows are gone.
- **Slim header**: company mark plus one button with the worker's name — language, theme and sign out moved into that menu. The link to the warehouse screen was removed from the worker area (it is a wall-screen page with no way back); the shared warehouse login now gets that link on its own card instead.
- **Assignment card**: start time first, then project and customer; three big actions (navigation, call, work order); address, contact, vehicle and crew as icon rows.
- **The note of that day** (written in the assignment dialog) is shown in yellow at the top of the card — it used to be invisible for the crew.
- **Team-mates are tappable**: their phone number dials directly; the site manager is listed once, with their number.
- Day heading says how many assignments the day has; the empty day has its own card.

## [1.14.0] — 2026-08-23

### Added
- **Follow-on offers on a project**: extra work ordered later is booked with description, amount and date. It raises the order value on the project page ("50.000 € + 4.500 € = 54.500 €") and in every figure that uses it — revenue, order book, open offers, customer report, plan vs. actual. Only users with financial access can book one; every change is in the change log.
- Work order: the **site checklists are printed** with the sheet (☒ done, ! problem with its note, who ticked and when).
- Project list: a small badge shows how far the checklists of a project are ticked (⚠ when a problem was noted).
- Excel export: new sheet **"Offene Angebote"** with number, project, customer, days waiting and net value.
- Reports → data quality: **offers without an answer** for more than 21 days are listed for follow-up.

## [1.13.0] — 2026-08-23


### Added
- **Site checklists**: reusable templates in Settings → Arbeitsbereiche ("Übernahme vom Vorgewerk" …), added to a project from a template or blank, ticked off on the phone: open → in order → problem. A problem takes a short note, and every tick stores **who** and **when**. Visible on the project page and in "Mein Bereich"; the crew may add a line on site.
- **Packing list on the worker's phone**: the tools/materials in "Mein Bereich" are now big tap targets (Benötigt → Gepackt → Fehlt) instead of a read-only list. Employees may only tick projects they are on the crew of or scheduled for; the warehouse screen shows a **QR code per assignment** that opens exactly that day's list on the phone (through the login, which now returns to the scanned page).
- **Open offers**: the order book KPI splits into **Angebote offen** · Beauftragt · In Ausführung · Geplant, and a new report tab **Angebote** lists every offer waiting for confirmation — oldest first, with the days it has been waiting (flagged from 21 days) and the cumulated net volume.

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
- **Change log in plain language:** actions and areas readable ("Einsatz verschoben", "Projektstatus automatisch geändert" …), status/role/packing values translated, technical key as tooltip; two clear buttons ("Älter als 90 Tage löschen", "Protokoll leeren", both with confirmation, the clearing itself is logged).
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
- User manual rewritten for beginners (18 chapters, 38 screenshots), covering every feature of 1.2.

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
- German user manual.

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
