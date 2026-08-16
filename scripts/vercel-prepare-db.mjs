// Runs as part of `npm run build` ONLY on Vercel (process.env.VERCEL is set):
// applies pending migrations and creates the base data when the database is
// empty — the same two steps docker-entrypoint.sh does at container start.
// On every other platform (Docker, local) it exits immediately, so the Docker
// flow is unchanged.
import { spawnSync } from 'node:child_process'

if (!process.env.VERCEL) {
  process.exit(0)
}
if (!process.env.DATABASE_URL) {
  console.error('Vercel build: DATABASE_URL is not set — add it in Vercel → Settings → Environment Variables.')
  process.exit(1)
}

console.log('Vercel build: applying database migrations …')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const migrate = spawnSync(npx, ['prisma', 'migrate', 'deploy'], { stdio: 'inherit', shell: process.platform === 'win32' })
if (migrate.status !== 0) process.exit(migrate.status ?? 1)

console.log('Vercel build: checking base data …')
const bootstrap = spawnSync(process.execPath, ['scripts/bootstrap.mjs'], { stdio: 'inherit' })
if (bootstrap.status !== 0) process.exit(bootstrap.status ?? 1)
