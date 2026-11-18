# CHANGE: Form templates that read like the office's printed forms — and travel as files

## Why

The office has its paperwork as PDFs: an acceptance record, a heating-up record
for screed, a consumer construction contract, a material sheet for ETICS. They
are to become form templates chosen for a project. The form builder could not
say what those sheets say: fixed paragraphs (a contract's conditions), a blank
in the middle of a sentence ("Der Baubeginn wird am ____ erfolgen."), a table
whose rows are printed in advance, two fields side by side, signatures in the
middle of a document rather than at its end. And the sheets are the client's
own documents: they may not be written into the code, the seed or a migration.

So the form feature was extended in a general way, and templates can now be
exported and imported as a JSON file. The client's forms live as such a file
**outside the repository** and are imported into each database.

## What changed

1. **New kinds of field** (`src/lib/forms.ts`, `FIELD_TYPES`):
   - `info` — *Fester Text*: a title (bold) and paragraphs as written; a line
     starting with "• " or "- " is a point of a list. Up to 8000 characters.
     Soft hyphens a word processor leaves in are taken out.
   - `signatures` — *Unterschriften*: where the boxes of the named signers stand
     (none named: everybody not placed elsewhere). Whoever is placed nowhere
     signs at the end, as before. On the screen the signing buttons stand there
     too.
   - `pagebreak` — *Neue Seite*: the PDF continues on a new page (never an
     empty one).
2. **New properties of a field**:
   - `suffix` (*Text danach*) for text, number and date: a unit or the rest of
     the sentence. A field with a suffix needs no label ("____ Euro netto").
   - `defaultValue` (*Vorgabewert*) for text, long text, number and choice:
     what the field holds when the project has nothing for it — the company's
     own address, say.
   - `half` (*Halbe Breite*): two consecutive half fields stand side by side, on
     screen and on paper.
   - a table's `rows` (*Feste Zeilen*): the table has exactly these rows; a
     cell with text is fixed, an empty one is filled in. And `widths`
     (*Spaltenbreiten*), relative column widths.
   - Labels may be empty for choice, multiple choice, long text and table (the
     heading above names them; messages name them by that heading,
     `fieldName`). A label may be 600 characters (a clause ticked as a whole);
     a template may have 250 fields.
3. **New prefills**: Projektnummer (the client's own number, `jobNumber`; the
   BauCrew number is now labelled "Nr. (BauCrew)"), Kunde mit Anschrift,
   Anschrift des Kunden, Kunde: Straße / PLZ und Ort / Telefon / E-Mail, Ort der
   Baustelle, Ort der Baustelle + heutiges Datum, geplanter Beginn, geplantes
   Ende, Fertig bis (`dueDate`). A day put into a text field is written
   `dd.mm.yyyy`; several lines put into a one-line field are joined with ", ".
   A *multiple choice* or *choice* prefilled with the trades ticks the answers
   that are the project's trades — one word the start of the other counts
   ("Malern" ticks "Maler"). A *table* prefilled with the open defects gets one
   row per defect.
4. **The PDF** (`src/lib/forms-pdf.ts`) now looks like a printed form: short
   fields as "Label: value" on a line to write on, the value in dark blue like
   a pen; long texts on ruled lines (two empty ones at least); every answer of
   a choice with its tick box, on one line or in columns; fixed texts with
   their bullets; tables with a grey head row and their own column widths
   (three empty rows when nobody wrote into one); headings never alone at the
   foot of a page; a little less space between fields and in the page head.
   A draft printed blank can be filled in by hand.
5. **What a signature signs** (`signedContent`) includes a field's fixed text,
   suffix, fixed rows and placed signers — only where a field has them, so the
   digest of every form signed before this change is unchanged (test).
6. **Templates that hold prices** — *Enthält Preise* on the template
   (`FormTemplate.financial`, copied to `FilledForm.financial`; migration
   `20261031180000_form_templates_financial`). Such forms, and the PDF filed
   from them, are seen only by users who may see money (`canViewFinancials`):
   not by site managers, not by the crew, not by managers without financial
   access. Checked in the form page, the PDF route, the file route, every form
   action, the project page's lists and `/my`.
7. **Export and import of templates** (`src/lib/form-template-file.ts`):
   *Alle exportieren* on Projekte → Formularvorlagen and *Exportieren* on one
   template download a JSON file (`GET /api/form-templates[?id=…]`, office
   only); *Vorlagen importieren* reads one. Every template goes through the
   same rules as one saved in the editor. A template whose name exists is left
   alone unless *ersetzen* is ticked; forms already made keep their own copy
   either way.
8. **The template editor** (`template-form.tsx`) edits all of the above: the
   text of a fixed text, text after, default value, half width, fixed rows and
   column widths, which signers sign at a `signatures` row, *Enthält Preise*.

## The client's forms

Kept in `local/forms/` of the main checkout (excluded via `.git/info/exclude`,
never committed): `build.py` writes `formularvorlagen.json` and checks every
fixed text, label, answer and cell word for word against the PDFs' own text.
They are brought into a database with *Vorlagen importieren*. Nothing of them
is in the code, the seed, the migrations or the tests.

## Files

- `prisma/schema.prisma`, `prisma/migrations/20261031180000_form_templates_financial/migration.sql`
- `src/lib/forms.ts`, `src/lib/forms-db.ts`, `src/lib/forms-pdf.ts`, `src/lib/form-template-file.ts` (new)
- `src/components/filled-form.tsx`
- `src/app/(admin)/projects/forms/page.tsx`, `actions.ts`, `template-form.tsx`, `import-templates.tsx` (new), `new/page.tsx`, `[id]/page.tsx`
- `src/app/api/form-templates/route.ts` (new), `src/app/api/forms/[id]/pdf/route.ts`, `src/app/api/files/[id]/route.ts`
- `src/app/form-actions.ts`, `src/app/forms/[id]/page.tsx`, `src/app/my/page.tsx`
- `src/app/(admin)/projects/[id]/project-detail.tsx` (three `where`s: forms, templates and filed PDFs with prices only with financial access)
- `messages/de.json`, `messages/en.json` (namespace `forms` only)
- `tests/unit/forms.test.ts`, `tests/unit/forms-pdf.test.ts` (new), `tests/unit/form-template-file.test.ts` (new), `tests/db/forms.test.ts`
- `docs/BENUTZERHANDBUCH.md` (Formulare und Unterschriften), `AGENTS.md` (this file's line)

## Rollback

1. Delete the imported templates under Projekte → Formularvorlagen (forms made
   from them keep their content; delete those on their projects if wanted).
2. `git revert` the commits of this change.
3. The two columns can stay (both default `false`, nothing else reads them).
   To remove them as well, on each database:
   ```sql
   ALTER TABLE "FilledForm" DROP COLUMN "financial";
   ALTER TABLE "FormTemplate" DROP COLUMN "financial";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261031180000_form_templates_financial';
   ```
4. A form already made with the new kinds of field keeps them in its JSON;
   after a revert `parseFields` drops what it does not know (fixed texts, page
   breaks, signature places) and the rest still works. A form *signed* with
   such fields would then no longer match its digest and shows "Inhalt passt
   nicht mehr zu den Unterschriften" — its filed PDF stays as it was signed.
