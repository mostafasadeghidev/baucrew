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

## Backups

The database is the single source of truth; uploaded documents (later phase)
will live in a volume that must be backed up too.

**Backup (daily via cron):**

```bash
docker compose exec -T db pg_dump -U baucrew -Fc baucrew > backup_$(date +%F).dump
```

Suggested policy: daily backups, keep 14 daily + 8 weekly, store copies
off-machine (e.g. object storage or a second server).

**Restore:**

```bash
docker compose exec -T db pg_restore -U baucrew -d baucrew --clean < backup_2026-08-14.dump
```

Test the restore path regularly — a backup that has never been restored is not a backup.

## Updating

```bash
git pull            # or copy the new release
docker compose up -d --build
```

Migrations run automatically at container start.
