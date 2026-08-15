import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { readFileSync } from 'node:fs'

// Base seed for a fresh installation: system accounts, work categories and a
// small tool/material catalog. It contains NO company data (no employees,
// vehicles, customers, projects or logo) and never deletes anything — safe to
// re-run. Enter real data through the app or `Einstellungen → Import`.

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})

async function main() {
  console.log('Seeding base data …')

  // Data shared with scripts/bootstrap.mjs (Docker first start)
  const data = JSON.parse(readFileSync(new URL('./seed-data.json', import.meta.url), 'utf8')) as {
    users: Array<{ username: string; password: string; role: 'ADMIN' | 'MANAGER' | 'EMPLOYEE'; canViewFinancials?: boolean }>
    workCategories: Array<[string, string]>
    catalogItems: Array<{ kind: 'TOOL' | 'MATERIAL'; name: string; unit?: string; category?: string }>
  }

  // ── System accounts (change these passwords before production!) ─────
  for (const u of data.users) {
    await db.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        passwordHash: await bcrypt.hash(u.password, 12),
        role: u.role,
        canViewFinancials: u.canViewFinancials ?? false,
      },
    })
  }

  // ── Work categories ──────────────────────────────────────
  for (const [i, [nameDe, nameEn]] of data.workCategories.entries()) {
    const existing = await db.workCategory.findFirst({ where: { nameDe } })
    if (!existing) await db.workCategory.create({ data: { nameDe, nameEn, sortOrder: i } })
  }

  // ── Catalog basics ───────────────────────────────────────
  for (const item of data.catalogItems) {
    const existing = await db.catalogItem.findFirst({ where: { name: item.name } })
    if (!existing) await db.catalogItem.create({ data: item })
  }

  console.log('Done.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
