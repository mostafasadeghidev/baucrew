# Deployment

The app is fully Dockerized and not coupled to any hosting provider.
It runs on a company server, a VPS, or any Docker-capable host.

## Production with docker-compose

```bash
# 1. Configure secrets
cp .env.example .env
#    Set POSTGRES_PASSWORD and SESSION_SECRET (openssl rand -hex 32)

# 2. Build and start (app + postgres)
docker compose up -d --build
```

- The container entrypoint runs `prisma migrate deploy` automatically before
  starting the server, so schema migrations are applied on every deploy.
- The app listens on port **3000**.

**Never run `npm run db:migrate` against a database with real data.** It is
`prisma migrate dev`, a development command: it may create a new migration
from schema drift and, when the histories do not match, offers to reset the
database — i.e. drop every table. Production and any copy of real data only
ever get `npm run db:deploy` (`prisma migrate deploy`), which is what the
container entrypoint runs.

### Optional variables

`docker-compose.yml` passes these through to the app container when they are
set in `.env`; empty or absent means "not configured" and the feature stays
hidden or disabled. None of them is needed for a plain installation.

| Variable | What it enables | Rule |
| --- | --- | --- |
| `TRELLO_API_KEY`, `TRELLO_TOKEN` | *Einstellungen → Trello*: the server reads the account's boards and brings every board switched on there into the projects by itself, files included (`docs/TRELLO-RESYNC.md`). Also the file fetch of *Einstellungen → Import aus Trello*. A read-only token is enough; nothing is written to Trello. | Keep them set for as long as the office works in Trello. On the day Trello is frozen: switch every board off, remove both from `.env`, `docker compose up -d`, delete the Trello app so the token is revoked. |
| `TRELLO_SYNC_INTERVAL_MINUTES` | How often the server runs the Trello sync by itself, in minutes. | Optional: empty means every 60 minutes; `0` turns the automatic run off (the button still works); below 15 counts as 15. |
| `WATTRO_API_KEY` | *Geräte → Mit Wattro abgleichen*: reading Wattro's machines into the Devices page (read-only). | Only together with a confirmed **production** `WATTRO_BASE_URL`. In production an unset base URL means "not configured": the sync stays off and a warning is logged once, so a key can never be sent to Wattro's development host by accident. |
| `WATTRO_BASE_URL` | Wattro's API root, environment and version included (e.g. `https://<host>/api/v1`). | Confirm the host with the key's owner before setting it; check in the container with `docker compose exec -T app sh -c 'echo ${WATTRO_BASE_URL:-UNSET}'`. |
| `WATTRO_SYNC_INTERVAL_MINUTES` | How often the running server reads Wattro by itself, in minutes. | Optional: empty means every 60 minutes; `0` turns the automatic read off (the button still works); below 15 counts as 15. |
| `INBOUND_API_KEY` | The automation door `POST /api/inbound/drafts` (drafts into the inbox, never live projects). | Unset = the endpoint answers 503. Generate with `openssl rand -hex 32`. |
| `FILE_STORAGE_DIR` | Where uploaded files are stored. | Leave unset in Docker — the default `/app/storage` is the `baucrew_files` volume. |

## HTTPS / reverse proxy

Run a reverse proxy in front of the app. Example with Caddy:

```
baucrew.example.com {
    reverse_proxy localhost:3000
}
```

nginx/Traefik work the same way; the app itself only needs `proxy_pass` to port 3000.

## First start (automatic)

Nothing to seed by hand. On every start the app container

1. applies pending database migrations (`prisma migrate deploy`), and
2. runs `scripts/bootstrap.mjs`: **only if the database has no users yet**, it
   creates the base data from `prisma/seed-data.json` — the system accounts
   below, the work categories and a small tool/material catalog. No company
   data. On later starts it does nothing.

| Username  | Password      | Role     |
| --------- | ------------- | -------- |
| `admin`   | `admin1234`   | Admin    |
| `buero`   | `buero1234`   | Office   |
| `lager`   | `lager1234`   | Employee (warehouse screen) |

Then sign in as `admin`, **change all passwords** (*Einstellungen*), set company
name and logo, and enter or import your data. Employee accounts are created on
the respective employee page.

## Alternative: Vercel (managed hosting)

Docker on your own server is the primary, recommended setup. The app can also
run on Vercel — same code, no changes:

1. **Database:** create a hosted PostgreSQL (e.g. Neon or Supabase; use the
   *pooled* connection string) — Vercel itself has no database.
2. **Vercel → New Project → Import** the GitHub repository. Framework: Next.js
   (auto-detected). Build command stays `npm run build`.
3. **Environment variables** (Settings → Environment Variables, all environments):
   - `DATABASE_URL` — the PostgreSQL connection string
   - `SESSION_SECRET` — random, ≥ 32 chars (`openssl rand -hex 32`)
   - the optional variables from the table above, under the same rules
4. **Deploy.** The build script runs `prisma generate`, then — only on Vercel —
   `prisma migrate deploy` and the base-data bootstrap (accounts, categories,
   catalog) against `DATABASE_URL`, then `next build`. Every later deploy applies
   new migrations automatically. Sign in as `admin / admin1234` and change the
   passwords.

Notes: serverless functions have execution-time limits — very large backups or
Trello imports may need to be split; keep the Docker path for heavy use.

## Wattro (optional)

The Devices page reads the client's Wattro (tool tracking). Set on the server:

- `WATTRO_API_KEY` — the key from Wattro (never in the repository)
- `WATTRO_BASE_URL` — the client's Wattro API root, e.g.
  `https://<company>.wattro.io/api/v1`

Restart the container (`docker compose up -d`). Wattro is then read
**automatically every hour** by the running server itself — nothing else to
set up (`WATTRO_SYNC_INTERVAL_MINUTES` changes the interval, 0 turns it off) —
and by hand with "Mit Wattro abgleichen". Every run is in the audit log.

**Projects to Wattro (off by default).** With `WATTRO_PROJECT_PUSH=1` the app
also *writes* projects to Wattro: a new project that is approved, planned or
running is created there under its project number (the client's Projektnummer when it
has one), and name, address, contact
and phone are kept up to date; a completed, cancelled or archived project is
marked finished. Prices, offers and internal notes never go. Only projects
created after the switch is turned on are caught up by the server; the jobs
that exist already are not sent by themselves. Every send is in the audit log
(`project.wattroPush`, `project.wattroPushFailed`).

## Backups

Two things make up the company's data, and both are backed up:

- **the database** — every project, customer, plan, comment, form;
- **the files** — uploaded PDFs, photos, Outlook e-mails, signed forms, the
  logo and board photos. They live in the Docker volume `baucrew_files`
  (mounted at `/app/storage` in the app container), not in the database. A
  board taken over from Trello brings its attachments along, so expect several
  hundred megabytes, growing by about a gigabyte a year.

A database dump without the files restores projects whose attachments are
missing; a files copy without the dump restores files nothing points to. Take
both at the same time.

**Backup (daily via cron):**

```bash
# the database
docker compose exec -T db pg_dump -U baucrew -Fc baucrew > backup_$(date +%F).dump
# the files — the volume as a tar archive, read from the running app container
docker compose exec -T app tar -czf - -C /app/storage . > files_$(date +%F).tar.gz
```

The files archive only grows; keep fewer copies of it than of the dump (for
example 7 daily + 4 weekly), or copy the volume incrementally with `rsync`
from `docker volume inspect baucrew_files` → `Mountpoint` instead.

Suggested policy: daily backups, keep 14 daily + 8 weekly, store copies
off-machine (e.g. object storage or a second server).

**Restore:**

```bash
docker compose exec -T db pg_restore -U baucrew -d baucrew --clean < backup_2026-08-14.dump
# the files of the same day, into the (empty or old) volume
docker compose exec -T app sh -c 'rm -rf /app/storage/* && tar -xzf - -C /app/storage' < files_2026-08-14.tar.gz
```

The in-app backup (Einstellungen → Daten & Protokoll) carries the project
files as well, base64 inside one JSON — right for a small installation or a
move to another server, too heavy once the files run into hundreds of
megabytes, and without the board photos. Past that size the two lines above
are the backup. Once the files run into gigabytes — a board taken over from
Trello with its attachments gets there at once — the in-app JSON backup is
not a backup any more: the export builds the whole JSON in memory and will
fail or hang. Use `pg_dump` plus the files archive only.

Test the restore path regularly — a backup that has never been restored is not a backup.

## Updating

```bash
git pull            # or copy the new release
docker compose up -d --build
```

Migrations run automatically at container start.
