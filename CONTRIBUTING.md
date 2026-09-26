# Contributing to BauCrew

How more than one person works on this code without stepping on each other.
Short on purpose; the project's rulebook for the code itself is `AGENTS.md`.

## The one rule

`main` is the shipped state. **Nobody pushes to it directly** — every change
arrives as a pull request that somebody else has read. That holds for the
maintainer as much as for anyone the agency adds.

## Day to day

1. **Start from the latest `main`:** `git switch main && git pull`
2. **Branch:** `git switch -c <type>/<short-name>` with `feat`, `fix`, `chore`
   or `docs` as the type — `fix/work-order-note`, `feat/site-photos`.
3. **Work in small steps.** Commit messages in English: a first line under 72
   characters in the imperative, a body that says *why*.
4. **Run the gate before you push:**
   ```bash
   npm run typecheck && npx eslint src prisma tests && npm test && npm run test:db && npm run build
   ```
5. **Open a pull request against `main`.** Say what changed, why, and how you
   tested it — a screenshot for anything visible. One topic per pull request;
   two topics are two pull requests.
6. **The other person reads the diff**, not only the description, asks in the
   review what is unclear, and approves. The author merges; GitHub deletes the
   branch.
7. **Keep long branches fresh:** merge `main` into your branch every day or two.
   Conflicts are cheap while they are small.

## What the checks do

Every pull request and every push to `main` runs `.github/workflows/checks.yml`
on GitHub: install, Prisma client, typecheck, ESLint, unit tests, the migrations
on a fresh PostgreSQL, the database tests, and the production build. Red is not
merged — fix the branch, the checks run again on their own.

## Rules of the code — the short version

`AGENTS.md` has the full set; what bites most often:

- Every visible string exists in both `messages/de.json` and `messages/en.json`;
  the German is the reference wording.
- Pure logic lives in `src/lib/*` without React or Next imports, with a test.
  Touch conflicts, reports, authorization, dates or importers → add a test.
- A schema change comes with a migration in `prisma/migrations`; a larger
  structural change also gets a `docs/CHANGE-*.md` with the rollback.
- Prices and revenue never reach an EMPLOYEE user — filtered in the query and
  the DTO, not only in the UI.
- **No real data, ever:** no customer, employee, address, logo, screenshot or
  dump from a live system in code, tests, docs, fixtures or commit messages.
  Examples use `Max Muster`, `Muster GmbH`, `Musterstadt`.

## Local setup

- Node 24, npm (not pnpm or yarn), Docker Desktop.
- `cp .env.example .env`, then set
  `DATABASE_URL="postgresql://baucrew:baucrew_dev@localhost:15532/baucrew?schema=public"`
  and a random `SESSION_SECRET`.
- ```bash
  docker compose -f docker-compose.dev.yml up -d
  npm ci && npx prisma generate
  npm run db:migrate && npm run db:seed
  npm run dev
  ```
  The app answers on http://localhost:15700 — sign in with `admin` / `admin1234`.
  `docs/BENUTZERHANDBUCH.md` is the user manual, `docs/API.md` the API.

## Releases

Releases are cut from `main` by the maintainer: a section in `CHANGELOG.md`, the
version in `package.json` and `package-lock.json`, the tag `vX.Y.Z`, the GitHub
release. Deployments follow releases. A feature pull request does not bump the
version or edit the changelog.
