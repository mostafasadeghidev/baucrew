# Changelog

All notable changes to BauCrew are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/).

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
