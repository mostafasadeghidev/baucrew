// First-start bootstrap for the Docker image: if the database has no users yet,
// create the base data (system accounts, work categories, tool/material catalog)
// from prisma/seed-data.json. Idempotent — does nothing on later starts.
// Uses plain `pg` + bcryptjs so the runtime image needs no Prisma client.
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
const bcrypt = require('bcryptjs')

const dataPath = new URL('../prisma/seed-data.json', import.meta.url)
const data = JSON.parse(readFileSync(dataPath, 'utf8'))
const cid = () => 'c' + randomBytes(12).toString('hex')

const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const { rows } = await client.query('SELECT count(*)::int AS n FROM "User"')
  if (rows[0].n > 0) {
    console.log('Bootstrap: users exist, nothing to do.')
  } else {
    console.log('Bootstrap: empty database — creating base data …')
    await client.query('BEGIN')
    for (const u of data.users) {
      await client.query(
        'INSERT INTO "User" (id, username, "passwordHash", role, "canViewFinancials", active, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,now(),now())',
        [cid(), u.username, await bcrypt.hash(u.password, 12), u.role, !!u.canViewFinancials]
      )
    }
    for (const [i, [nameDe, nameEn]] of data.workCategories.entries()) {
      const exists = await client.query('SELECT 1 FROM "WorkCategory" WHERE "nameDe" = $1', [nameDe])
      if (!exists.rowCount)
        await client.query('INSERT INTO "WorkCategory" (id, "nameDe", "nameEn", active, "sortOrder") VALUES ($1,$2,$3,true,$4)', [cid(), nameDe, nameEn, i])
    }
    for (const it of data.catalogItems) {
      const exists = await client.query('SELECT 1 FROM "CatalogItem" WHERE name = $1', [it.name])
      if (!exists.rowCount)
        await client.query(
          'INSERT INTO "CatalogItem" (id, kind, name, category, unit, active, "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,$5,true,now(),now())',
          [cid(), it.kind, it.name, it.category ?? null, it.unit ?? null]
        )
    }
    await client.query('COMMIT')
    console.log(`Bootstrap: created ${data.users.length} accounts (admin/admin1234 …) — change the passwords!`)
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  throw e
} finally {
  await client.end()
}
