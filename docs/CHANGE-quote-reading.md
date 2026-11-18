# CHANGE: Quotes read from the project's PDFs

## What changed

The client puts every quote (Angebot) — a PDF from the accounting program — on
the project's Trello card, and the office uploads others in the app. Until now
nothing read inside those files: the price came only from Trello's
"Auftragswert", the Projektnummer only from the bracket number in the card
title. Wish: "Beträge automatisiert aus den Angeboten erkennen, ebenso die
Vorgangsnummer".

Now every PDF on a project is read once for a quote:

- **Is it a quote?** Decided from the words, never the file name: the
  accounting program's page head (`Angebot  <no.>  Datum  <date>`, also
  "Angebot Nachtrag …"), or — for other senders — a title "Angebot" /
  "Nachtragsangebot" near the top *and* a sum. The same program's
  "Rechnung", "Bestätigung", "Schlussrechnung" … are not quotes; a tender form
  with blank sum lines is not a quote.
- **What is read:** net, VAT (amount and rate), gross — as printed, kept both —
  the quote's own number, the **Vorgangsnummer** and the date. The
  Vorgangsnummer is the job's number: the program prints it as
  "Baustellennr." on the quote and "Vorgang-Nr." on the cover letter, and it is
  the project's Projektnummer (`jobNumber`), as the owner decided. Totals are
  kept only when they add up (net + VAT = gross, or gross = net at 19/7/16/5 %);
  figures that do not are dropped, not guessed.
- **How:** the PDF's own text layer, rebuilt into rows from the positions of
  its words (`unpdf`, pure JavaScript, nothing native; `src/lib/quote-pdf.ts`),
  then pure rules (`src/lib/quotes.ts`). Nothing leaves the server.
- **Scans** (no text layer) are not read — unless `QUOTE_OCR=1` is set, then
  they go to OpenAI with the key already used by the assistant and the voice
  notes (`src/lib/quote-ocr.ts`, model `QUOTE_OCR_MODEL`, default gpt-5-mini).
  **This sends the client's documents — prices, the customer's name and
  address — to OpenAI.** Off by default. What comes back passes the same
  checks as a text reading.
- **When:** a PDF uploaded in the app (after the answer, via `after()`), a PDF
  sent through the API, and each PDF the Trello import fetches. The files that
  were there before: `scripts/quote-backfill.mjs` (below), or per project the
  button "Jetzt lesen" in the quotes card.
- **Stored** per document in the new table `DocumentQuote` (kind QUOTE / OTHER
  / SCAN / FAILED, the figures, the reader's version, `inTotal`, why the reader
  left it out, who confirmed it).
- **On the project** (new card "Angebote" beside the files, office only): each
  quote's number, date, Vorgangsnummer, net and gross, "aus Angebot erkannt" or
  "bestätigt"; a tick "In der Summe" per quote; the net and gross total across
  those that count; files without text listed with "Werte eintragen" to type a
  scanned quote's figures by hand. Buttons: Bestätigen, Korrigieren, Kein
  Angebot.
- **What counts by itself:** a quote with a Vorgangsnummer. Left out by the
  reader: the same quote a second time (same number — the file attached twice);
  a **supplement** — a document calling itself "Angebot Nachtrag …" or
  "Nachtragsangebot" — because the office also enters a Nachtrag as a
  Zusatzleistung, and counted in the quote total as well it would be in the
  order value twice (owner's decision, 2026-11-03); and a quote without a
  Vorgangsnummer (on the real data: suppliers' quotes to the office, which are
  costs). Each is still listed with its amounts and says why it is out; the
  office ticks it in or out by hand, and a quote read again keeps that tick.
- **Price:** `Project.price` takes the quotes' **net** total while it is empty
  — net because Trello's "Auftragswert" is net (see below). The total is the
  quotes that count, so a supplement is not in the price either until the
  office ticks it in. It keeps following
  the total (another quote, one taken out) while it is still that figure
  (`Project.priceFromQuote`), shown "aus Angebot erkannt" in the price row and
  the card. Typed by hand, or confirmed ("Bestätigen"), it is the office's and
  never touched again.
- **Projektnummer:** filled from the Vorgangsnummer only while empty, only when
  the project's quotes agree on one number, and only when no other project
  holds it (the column stays unique). Marked by `Project.jobNumberFromQuote`
  until confirmed. A quote whose Vorgangsnummer differs from the project's
  shows a warning; nothing is overwritten. Filling it tells Wattro (renamed
  there, as when it is typed) when the push is on.
- **Never overwrite:** a value typed by hand is never changed; a confirmed or
  corrected reading is never read again. Every change is in the audit log:
  `project.quote.read`, `project.quote.price` (old/new), `project.jobNumber`
  (as when typed), `project.quote.include/exclude/confirm/correct/notQuote`,
  `project.quote.priceConfirmed`, `project.quote.jobNumberConfirmed`. The card's
  history shows "hat ein Angebot in … erkannt" — to those who may see money.
- **Who sees what:** amounts are financial — selected in the query only for
  `canViewFinancials`; a manager without it sees the quotes' numbers and dates,
  no amounts, no money buttons. A PDF read as a quote is office-only (ADMIN,
  MANAGER): not in a site manager's file list, never on `/my`, refused by
  `/api/files/<id>` to SITE_MANAGER and EMPLOYEE, set to office-only when read,
  and it cannot be ticked visible for the crew.

### What the real quotes look like (copy of 2026-10-31; counts only)

1187 PDFs on projects; 259 without a text layer (scans, photos), 0 that would
not open. 397 quotes: 388 in the accounting program's layout (total row
`Gesamtbetrag  <net>  <tax>  19,00%  <gross>` under `Netto/EUR  Steuer/EUR
Brutto/EUR`, all adding up, all 19 %), 9 of other senders. 396 have totals.
The Baustellennr. equals the project's Projektnummer on 294 of the 306 quotes
whose project had one; the quote's own number never does.

**Auftragswert is net:** of 182 projects with both a Trello price and quote
totals, the price equals a quote's net exactly on 29, within 2 % on 42 more,
within 10 % on 40 more — and a gross figure exactly on none (within 2 %: 6).
107 of the prices are round thousands, the office's rounded net.

**Backfill on that copy** (`--apply`, then again: the second run read 0;
run afresh on 2026-11-03 with the supplement rule):
397 quotes (362 in the total, 16 the same quote again, 12 supplements,
7 without a Vorgangsnummer); 148 empty prices filled; 56 empty Projektnummern filled
(none of those projects was in Wattro yet); 12 quotes on 9 projects whose
Vorgangsnummer differs from the project's — hint shown, nothing changed;
2 projects whose quotes carry different Vorgangsnummern and 10 whose number
another project already holds — left empty. 13 scans have "Angebot" in their
name and wait for OCR or hand entry.

**Supplements on that copy:** 12 "Angebot Nachtrag" quotes (with or without
"NA 1" … "NA 3") on 9 projects. Leaving them out changed the quote total of
those 9 projects; one of them carries nothing but a supplement and now has no
quote total. It changed one price — the only one of the nine the quotes had
filled (it fell to the main quote's net); the other eight have a price from
Trello, which the quotes never touch.

## Files

New:
- `src/lib/quotes.ts` — the pure rules: rows from positioned words, amounts,
  dates, quote or not, totals, what counts, price and Projektnummer decisions.
- `src/lib/quote-pdf.ts` — PDF → rows with `unpdf` (first 4 and last 12 pages
  of a long file).
- `src/lib/quote-ocr.ts` — scans to OpenAI, only with `QUOTE_OCR=1`.
- `src/lib/quotes-db.ts` — read one document, store it, apply to the project;
  no Next.js imports (the backfill uses it).
- `src/lib/quotes-app.ts` — the app's call after an upload / a Trello file.
- `src/app/(admin)/projects/[id]/quote-actions.ts` — the office's actions.
- `src/app/(admin)/projects/[id]/quotes-card.tsx`, `quotes-panel.tsx` — the card.
- `scripts/quote-backfill.mjs` — the one-off backfill.
- `docker-compose.tools.yml` — runs it on production from the image's `tools` stage.
- `prisma/migrations/20261102120000_quote_reading/migration.sql`.
- `tests/unit/quotes.test.ts`, `tests/db/quotes.test.ts` (invented texts and
  PDFs only).

Changed:
- `prisma/schema.prisma` — `DocumentQuote`, enum `QuoteKind`,
  `Project.priceFromQuote`, `Project.jobNumberFromQuote`, relations on
  `Document` and `User`.
- `package.json`, `package-lock.json` — `unpdf`.
- `Dockerfile` — a first stage `tools` (source, `tsx`, Prisma client; no
  Next.js build) for `docker-compose.tools.yml`.
- `src/app/api/projects/[id]/files/route.ts`, `src/lib/api-service.ts`,
  `src/lib/trello-files.ts` — read a new PDF.
- `src/app/api/files/[id]/route.ts` — a quote only for the office.
- `src/app/(admin)/projects/[id]/project-detail.tsx` — quote files off the
  site manager's list, the card, the price row's mark, history filter.
- `src/app/(admin)/projects/[id]/file-actions.ts` — a quote not made visible
  to the crew; deleting a quote lets the price follow.
- `src/app/my/page.tsx` — never a quote on the crew's page.
- `src/lib/card-history.ts` — "Angebot erkannt".
- `src/lib/backup-tables.ts` — `DocumentQuote` in the backup.
- `messages/de.json`, `messages/en.json` — namespace `quotes`,
  `projects.priceFromQuote`, `history.quoteRead`, `audit.actions.project_quote_*`.
- `.env.example` — `QUOTE_OCR`, `QUOTE_OCR_MODEL`.

## Running the backfill

It reads every PDF without a current reading, then applies each project once
(so the order of the files does not decide the Projektnummer). Safe to run
twice: the second run reads 0 files. It prints counts only — no names, no
amounts. Without `--apply` it writes nothing. Scans stay unread (no
`QUOTE_OCR`).

Locally, against a copy:

```
npx tsx --env-file=.env scripts/quote-backfill.mjs            # dry run, writes nothing
npx tsx --env-file=.env scripts/quote-backfill.mjs --apply    # reads and writes
```

### On production (once, right after the release)

The app's image is the slim `runner` stage: no `tsx`, no `src/`, no
`scripts/`. The backfill runs from the Dockerfile's `tools` stage instead —
same release, full source, `tsx`, the Prisma client, but no `next build` (so
it needs little memory and never competes with the running app) — as the
service `quote-backfill` in `docker-compose.tools.yml`: on the app's network,
against the `db` service with the password from the server's `.env`, with the
app's file volume mounted **read-only**. `docker compose up` never starts it
(profile `tools`, and the file is only read when named with `-f`). Its layers
are the build stage's, which the release's `docker compose up -d --build` has
just built, so building it takes seconds.

These exact steps were tried on 2026-11-03 against a stand-in: a compose
project with the real-data copy's database (reset to before any reading) and
its files in the `baucrew_files` volume. Dry run, `--apply` and a second run
gave the same counts as the local run below, and the second run read 0.

On the server, after the release is deployed and the app is up (its start
applied the migration `20261102120000_quote_reading`):

```
cd /opt/baucrew
docker compose ps
```

Both `app` and `db` must be running. Then, before anything is written, a
backup of the database:

```
docker compose exec -T db pg_dump -U baucrew -d baucrew | gzip > /root/baucrew-before-quote-backfill-$(date +%F-%H%M).sql.gz
ls -lh /root/baucrew-before-quote-backfill-*.sql.gz
```

Build the tools image and do a dry run (reads the files, writes nothing):

```
docker compose -f docker-compose.yml -f docker-compose.tools.yml build quote-backfill
docker compose -f docker-compose.yml -f docker-compose.tools.yml run --rm quote-backfill
```

It prints `DRY RUN · reader v1 · N PDF(s) to read` and counts (`QUOTE`,
`OTHER`, `SCAN`, `FAILED`). `FAILED` should be 0 or a handful; many failures
mean the files are not where the database says (wrong volume) — stop there.
Then the real run:

```
docker compose -f docker-compose.yml -f docker-compose.tools.yml run --rm quote-backfill --apply
```

It prints `APPLY …` and what it filled (`price filled (was empty)`,
`Projektnummer filled (was empty)`, `quotes whose Vorgangsnummer differs from
the project`). Running the same line again must print `0 PDF(s) to read`.
Remove the tools image afterwards (it holds the source, not the data):

```
docker image rm baucrew-quote-backfill
```

The pages show the new figures at once (they are read on each visit).

**Wattro:** the backfill does not send anything to Wattro. A project that was
already in Wattro under the app's number (`2026-0804`) and now got a
Projektnummer from its quotes keeps the old number there until its next save
in the app, which renames it (the push identifies it by the link, not the
number). The run prints `of them already in Wattro under the app number` when
there are any; open each and save it, or leave it to the next edit.

**Undo** (only if it went wrong): restore the backup —

```
docker compose stop app
docker compose exec -T db psql -U baucrew -d postgres -c 'DROP DATABASE baucrew WITH (FORCE)' -c 'CREATE DATABASE baucrew OWNER baucrew'
gunzip -c /root/baucrew-before-quote-backfill-<date>.sql.gz | docker compose exec -T db psql -U baucrew -d baucrew -v ON_ERROR_STOP=1
docker compose start app
```

— or, to keep everything else the office did since, take back only what the
quotes filled (step 3 of the rollback below) and `DELETE FROM "DocumentQuote"`.

## Rollback

1. Revert the code commit(s) of this change.
2. Remove the reading's data and columns:
   ```sql
   DROP TABLE "DocumentQuote";
   DROP TYPE "QuoteKind";
   ALTER TABLE "Project" DROP COLUMN "priceFromQuote", DROP COLUMN "jobNumberFromQuote";
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20261102120000_quote_reading';
   ```
3. Prices and Projektnummern the quotes filled stay on the projects. To take
   them back as well, run *before* step 2:
   ```sql
   UPDATE "Project" SET price = NULL WHERE "priceFromQuote" IS NOT NULL AND price = "priceFromQuote";
   UPDATE "Project" SET "jobNumber" = NULL WHERE "jobNumberFromQuote" IS NOT NULL AND "jobNumber" = "jobNumberFromQuote";
   ```
   (Confirmed ones are no longer marked and stay; the audit log lists every
   one under `project.quote.price` and `project.jobNumber`.)
4. `npm uninstall unpdf`; remove the `tools` stage from the `Dockerfile` and
   `docker-compose.tools.yml`.

## Open

- A supplement is left out of the total, not turned into a Zusatzleistung: the
  office enters the Zusatzleistung itself, as before.
- OCR is built but untested against real scans (off by default, sends data to
  OpenAI) — switch on only after the owner agrees.
