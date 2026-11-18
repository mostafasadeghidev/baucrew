# CHANGE: A project's needs — Material, Werkzeug, Maschinen on the card, and lists imported

## What changed

No schema change: the data model was already there — `CatalogItem` (one
catalogue of materials and tools, kind configurable under Einstellungen →
Artikelarten), `ProjectItem` (what a project needs from it: quantity, status,
note) and `ProjectDevice` (the machines a project needs, from the
Wattro-synced devices). What changed is how the office sees, edits and fills
them.

1. **Three sections on the card and the project page.** The one list "Werkzeug
   und Material" and the block "Benötigte Geräte" became one shared block
   (`NeedsSections`) with a section per kind — **Material**, **Werkzeug**, then
   any extra kind the company added — and **Maschinen**. Each kind section:
   - picks only entries of its own kind, with search (the combobox as before);
     a name not in the catalogue can be made there (office only), as that kind;
   - shows quantity with the entry's unit, the stock warning and the status
     (Benötigt / Gepackt / Fehlt) as before, and now the row's **note**;
   - the pencil edits quantity and note in place; ✕ removes the row;
   - **Liste einfügen** (see 3b) and **Zum Lager →** (office), which opens
     the warehouse filtered to that kind.

   Maschinen is the old device block, unchanged inside: picked from the
   devices, read-only Wattro data, hand-out/return for the app's own devices,
   **Zu den Geräten →**.

   On the card (`/projects/card/<id>`) the block moved out of the folded
   "Weitere Angaben" to its own place after the checklists; the fold's title
   is now "Weitere Angaben: Zeit, Nachträge, Rechnungen". On the full page it
   stands where the two old blocks stood. `#material` still points at the
   first section (the reports' missing-material links).

2. **Starter catalogue.** `src/lib/catalog-starter.ts` — about 65 typical
   materials and tools for painting, plaster and drywall (Dispersionsfarbe,
   Tiefgrund, Spachtelmasse, Gipskartonplatten, Malerkrepp …; Farbroller,
   Quast, Flächenspachtel, Akkuschrauber, Leiter …) as a semicolon list. It is
   read by the same importer as any list: **Lager → Liste importieren →
   Startliste**, with the same preview. `prisma/seed.ts` brings it into a
   development database (only new entries; nothing typed is touched). It is
   never put into a real database by itself.

3. **Importing lists.**
   - **(a) Catalogue list** — `/warehouse/import` (button "Liste importieren"
     on the Lager page; a card under Einstellungen → Daten links there too):
     paste from Excel (tabs) or a CSV text (semicolons), or choose an `.xlsx` /
     `.csv` file. Columns kind; name; category; unit; location; note, with or
     without a header row (headers found by their usual German and English
     names); a list of names only takes the kind chosen beside it. The
     preview says per line: **Neu**, **Ergänzt** (there, gets the fields it
     has empty), **Schon da**, **Doppelt** (twice in the list), and lists the
     lines it cannot read (no name, unknown kind). Same kind + same name
     (case and spaces aside) = the same entry; nothing is ever overwritten.
     On "übernehmen" the server makes the plan again against the catalogue
     as it is then, in one transaction. Audit: `import.catalog`.
   - **(b) Needs list into one project** — "Liste einfügen" on the card:
     one thing per line ("10 Eimer Dispersionsfarbe weiß", "Malerkrepp: 30
     Rollen", "2x Farbroller", cells copied from a sheet). Each line shows
     the entry it was read as (exact, a plural, or the one entry holding the
     word); when several fit, the person chooses; unknown names can be made
     as a new entry of a chosen kind (office) or left out. An entry already on
     the project gets only an empty quantity or note filled — no second row.

4. **Assistant (MCP).** Three tools in `src/lib/mcp-catalog.ts`, worked in
   `src/lib/project-needs-tools.ts`: `list_catalog` (read), `get_project_needs`
   (read), `add_project_needs` (write — confirmed before it runs, like every
   write; matches names as 3b does; unknown names come back unless
   `createMissing`, office only; machines by name or inventory number). Staff
   access, like the card: a site manager only for their projects.

The rules (splitting pasted text, header detection, kind words, duplicate
detection, reading a needs line, matching it) are pure code in
`src/lib/project-needs.ts`, tested in `tests/unit/project-needs.test.ts`.

## Files

New:
- `src/lib/project-needs.ts` — parsing and matching (pure)
- `src/lib/project-needs-server.ts` — preview and add a needs list; needs of a project
- `src/lib/project-needs-tools.ts` — the assistant's three tools
- `src/lib/catalog-starter.ts` — the starter list
- `src/app/(admin)/warehouse/import/{page.tsx,catalog-import.tsx,actions.ts}` — catalogue import
- `src/app/(admin)/projects/[id]/needs-sections.tsx` — the three sections
- `src/app/(admin)/projects/[id]/needs-paste.tsx` — "Liste einfügen"
- `src/app/(admin)/projects/[id]/needs-actions.ts` — row quantity/note, paste preview and add
- `tests/unit/project-needs.test.ts`
- `docs/CHANGE-project-needs.md` (this file)

Changed:
- `src/app/(admin)/projects/[id]/project-detail.tsx` — the two old blocks (twice: card and page) replaced by `NeedsSections`; catalogue options carry their kind; rows carry kind and note
- `src/app/(admin)/projects/[id]/project-items.tsx` — note shown, quantity/note edited in place, optional `kinds` / `placeholder` / `emptyText` (the schedule dialog uses it unchanged)
- `src/app/(admin)/warehouse/page.tsx` — "Liste importieren" button
- `src/app/(admin)/settings/page.tsx` — card under Daten
- `src/lib/mcp-catalog.ts`, `src/lib/mcp-tools.ts` — the three tools
- `tests/unit/mcp-catalog.test.ts` — the new tools' access
- `prisma/seed.ts` — the starter list for dev
- `messages/de.json`, `messages/en.json` — `projectNeeds.*`, `catalogImport.*`, `projects.{itemNote,editItem,quantityInvalid}`, `warehouse.importList`, `projects.sheetMoreData` reworded
- `AGENTS.md` — this file listed

## Rollback

No migration, no data to undo — rows made by an import are ordinary
catalogue entries (deactivate or delete them under Lager if wanted; the audit
log has `import.catalog` with the counts).

1. Revert the commit (`git revert <sha>`), or by hand:
2. In `project-detail.tsx` put back the two sections (`<section id="material">`
   with `ProjectItemsEditor` and the "Benötigte Geräte" section with
   `ProjectDevicesEditor` and the hand-out list) in both branches — in the
   card's branch inside the "Weitere Angaben" fold — and remove the two
   `<NeedsSections {...needsProps} />` and `needsProps`.
3. Delete the new files above; remove the three tools from `mcp-catalog.ts`,
   `mcp-tools.ts` and the test; the button in `warehouse/page.tsx`; the card in
   `settings/page.tsx`; the starter block in `prisma/seed.ts`.
4. In `project-items.tsx` drop the note line, the pencil and the edit row and
   the three optional props.
5. Messages: drop `projectNeeds` and `catalogImport`, the four keys above,
   and set `projects.sheetMoreData` back to "Weitere Angaben: Material,
   Geräte, Zeit, Nachträge, Rechnungen" / "More: material, devices, time,
   add-ons, invoices".
