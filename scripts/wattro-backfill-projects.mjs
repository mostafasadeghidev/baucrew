#!/usr/bin/env node
// Sends a hand-picked list of EXISTING projects to Wattro — the backfill that
// the automatic push (src/lib/wattro/project-push.ts) deliberately does not do
// by itself. Runs inside the production container, with its own environment
// (DATABASE_URL, WATTRO_API_KEY, WATTRO_BASE_URL); nothing is printed of those.
//
//   node wattro-backfill-projects.mjs --keys=1234568,2026-0001          dry run: writes NOTHING
//   node wattro-backfill-projects.mjs --keys=1234568,2026-0001 --apply   creates them in Wattro
//   … --allow-similar   also creates a project that looks like one Wattro has
//
// A key is a project's Projektnummer or, where it has none, the app's own
// number. Only the projects named are touched; at most MAX_KEYS per run.
//
// Per project it:
//   - skips it unless it is a project the push would create (APPROVED, PLANNED
//     or IN_PROGRESS, not archived, not linked to Wattro yet);
//   - skips it if Wattro already holds a project under its number;
//   - skips it, as a possible duplicate, if a Wattro project has the same name
//     or shares two words with it — the crews made many of their sites by
//     hand; whether one is the same site is a person's call. Once a person
//     has made it (the client accepts the double), --allow-similar sends it
//     and names the look-alike. Since a project is named after the customer
//     and the trades, two trades in common ("Malern", "Putz") look alike too;
//   - otherwise (with --apply) POSTs it to Wattro, then writes the link
//     (ProjectLink, system "wattro") and an audit entry in one transaction.
//
// Only POST /project/ is ever written; nothing is changed or deleted in Wattro.
// The field rules below mirror src/lib/wattro/projects.ts; a test
// (tests/unit/wattro-backfill-script.test.ts) keeps the two the same.

import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const MAX_KEYS = 15
export const PUSH_STATUSES = ['APPROVED', 'PLANNED', 'IN_PROGRESS']
const FINISHED_STATUSES = ['COMPLETED', 'INVOICED', 'PAID', 'CANCELLED']
const LIMITS = { name: 100, humanId: 50, contact: 100, address: 200, phone: 20 }

const clip = (value, max) => String(value ?? '').trim().slice(0, max)
const orNull = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  return text ? clip(text, max) : null
}

/** The number Wattro knows a project by: the client's Projektnummer, else the app's own. */
export const wattroKeyOf = (p) => clip(p.jobNumber || p.number, LIMITS.humanId)

export function addressLine(p) {
  const town = [p.postalCode?.trim(), p.city?.trim()].filter(Boolean).join(' ')
  const line = [p.street?.trim(), town].filter(Boolean).join(', ')
  return line ? clip(line, LIMITS.address) : null
}

export function wattroPhone(phone) {
  const text = String(phone ?? '').replace(/\s+/g, ' ').trim()
  return text && text.length <= LIMITS.phone ? text : null
}

export const isFinished = (p) => FINISHED_STATUSES.includes(p.status) || Boolean(p.archivedAt)
export const shouldCreate = (p) => PUSH_STATUSES.includes(p.status) && !p.archivedAt

/** The body Wattro takes to create a project — the same fields, the same limits as the app's push. */
export function toBody(p) {
  return {
    name: clip(p.name, LIMITS.name) || p.number,
    human_id: wattroKeyOf(p),
    contact: orNull(p.contact, LIMITS.contact),
    address: addressLine(p),
    phone: wattroPhone(p.phone),
    finished: isFinished(p),
  }
}

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\(\d+\)/g, ' ')
    .replace(/[^a-zäöüß0-9]+/g, ' ')
    .trim()
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length >= 4))

/** Wattro projects that look like the same site: the same name, or two words in common. */
export function similarInWattro(name, wattroProjects) {
  const mine = words(name)
  return wattroProjects.filter((w) => {
    if (norm(w.name) === norm(name)) return true
    let shared = 0
    for (const word of words(w.name)) if (mine.has(word)) shared++
    return shared >= 2
  })
}

export function parseArgs(argv) {
  const keysArg = argv.find((a) => a.startsWith('--keys='))
  const keys = keysArg
    ? [...new Set(keysArg.slice('--keys='.length).split(',').map((k) => k.trim()).filter(Boolean))]
    : []
  return { keys, apply: argv.includes('--apply'), allowSimilar: argv.includes('--allow-similar') }
}

// ── Wattro (reads, and the one write) ───────────────────────────────────

function wattroApi() {
  const base = (process.env.WATTRO_BASE_URL ?? '').trim().replace(/\/+$/, '')
  const key = (process.env.WATTRO_API_KEY ?? '').trim()
  if (!base || !key) throw new Error('WATTRO_BASE_URL and WATTRO_API_KEY must be set')
  const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
  return { call }
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  const { keys, apply, allowSimilar } = parseArgs(process.argv.slice(2))
  if (keys.length === 0) throw new Error('Give the projects: --keys=<Projektnummer>,<Projektnummer>,…')
  if (keys.length > MAX_KEYS) throw new Error(`At most ${MAX_KEYS} projects per run (got ${keys.length})`)

  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const wattro = wattroApi()

  console.log(apply ? 'APPLY: eligible projects are created in Wattro.' : 'DRY RUN: nothing is written anywhere.')
  const list = await wattro.call('GET', '/project/')
  if (list.status !== 200 || !Array.isArray(list.body)) throw new Error(`Wattro project list answered ${list.status}`)
  const inWattro = list.body
  console.log(`Wattro holds ${inWattro.length} projects (${inWattro.filter((p) => !p.finished).length} open).\n`)

  const tally = { create: 0, created: 0, skipped: 0, failed: 0 }
  try {
    for (const key of keys) {
      const { rows } = await db.query(
        `select p.id, p.number, p."jobNumber", p.name, p.status, p."archivedAt", p.street, p."postalCode", p.city, p.phone, p.contact,
                (select count(*)::int from "ProjectLink" l where l."projectId" = p.id and l.system = 'wattro') as links
           from "Project" p where p."jobNumber" = $1 or p.number = $1`,
        [key]
      )
      if (rows.length !== 1) {
        console.log(`SKIP    ${key}: ${rows.length === 0 ? 'no such project' : 'ambiguous, more than one project'}`)
        tally.skipped++
        continue
      }
      const p = rows[0]
      const label = `${key} · ${p.name}`
      if (p.links > 0) {
        console.log(`SKIP    ${label}: already linked to Wattro`)
        tally.skipped++
        continue
      }
      if (!shouldCreate(p)) {
        console.log(`SKIP    ${label}: status ${p.status}${p.archivedAt ? ' (archived)' : ''} is not one the push creates`)
        tally.skipped++
        continue
      }
      const body = toBody(p)
      const taken = await wattro.call('GET', `/project/by_human_id/${encodeURIComponent(body.human_id)}`)
      if (taken.status === 200) {
        console.log(`SKIP    ${label}: Wattro already has a project numbered ${body.human_id}`)
        tally.skipped++
        continue
      }
      if (taken.status !== 404) {
        console.log(`FAILED  ${label}: Wattro answered ${taken.status} to the number lookup`)
        tally.failed++
        if (apply) break
        continue
      }
      const similar = similarInWattro(p.name, inWattro)
      const lookAlikes = similar.map((w) => `${w.human_id} "${w.name}"`).join(', ')
      if (similar.length > 0 && !allowSimilar) {
        console.log(`SKIP    ${label}: possible duplicate of ${lookAlikes}`)
        tally.skipped++
        continue
      }
      if (similar.length > 0) console.log(`NOTE    ${label}: looks like ${lookAlikes}; sent all the same (--allow-similar)`)

      console.log(`${apply ? 'CREATE ' : 'WOULD CREATE'}  ${label}`)
      console.log(`          -> ${JSON.stringify(body)}`)
      tally.create++
      if (!apply) continue

      const made = await wattro.call('POST', '/project/', body)
      if (made.status !== 201 || typeof made.body?.id !== 'number') {
        console.log(`FAILED  ${label}: Wattro answered ${made.status}; stopping here`)
        tally.failed++
        break
      }
      try {
        await db.query('begin')
        await db.query(
          `insert into "ProjectLink"(id, "projectId", system, "externalId", "updatedAt") values ($1, $2, 'wattro', $3, now())`,
          ['c' + crypto.randomBytes(12).toString('hex'), p.id, String(made.body.id)]
        )
        await db.query(
          `insert into "AuditLog"(id, action, entity, "entityId", "newValue") values ($1, 'project.wattroPush', 'Project', $2, $3)`,
          ['c' + crypto.randomBytes(12).toString('hex'), p.id, `backfill created ${body.human_id}`]
        )
        await db.query('commit')
      } catch (e) {
        await db.query('rollback').catch(() => {})
        console.log(`FAILED  ${label}: created in Wattro (id ${made.body.id}) but the link could not be saved: ${e.message}`)
        tally.failed++
        break
      }
      console.log(`          created in Wattro as id ${made.body.id}`)
      tally.created++
    }
  } finally {
    await db.end()
  }

  console.log(
    `\n${apply ? `Created ${tally.created}` : `Would create ${tally.create}`}, skipped ${tally.skipped}, failed ${tally.failed}.` +
      (apply ? '' : '\nNothing was written. Add --apply to create the ones marked WOULD CREATE.')
  )
  if (tally.failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Stopped:', e.message)
    process.exit(1)
  })
}
