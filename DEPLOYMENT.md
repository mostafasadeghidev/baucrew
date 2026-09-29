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
4. **Deploy.** The build script runs `prisma generate`, then — only on Vercel —
   `prisma migrate deploy` and the base-data bootstrap (accounts, categories,
   catalog) against `DATABASE_URL`, then `next build`. Every later deploy applies
   new migrations automatically. Sign in as `admin / admin1234` and change the
   passwords.

Notes: serverless functions have execution-time limits — very large backups or
Trello imports may need to be split; keep the Docker path for heavy use.

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
are the backup.

Test the restore path regularly — a backup that has never been restored is not a backup.

## Updating

```bash
git pull            # or copy the new release
docker compose up -d --build
```

Migrations run automatically at container start.
