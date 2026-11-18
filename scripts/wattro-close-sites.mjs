#!/usr/bin/env node
// Marks a hand-picked list of sites in Wattro as finished ("erledigt") — the
// sites the crews made there by hand before the app sent its projects. Once a
// project stands in Wattro under its own number, the old hand-made entry is a
// double; finished takes it out of the crews' pick list. Runs inside the
// production container, with its own environment (DATABASE_URL, WATTRO_API_KEY,
// WATTRO_BASE_URL); nothing is printed of those.
//
//   node wattro-close-sites.mjs --numbers=P4,P6          dry run: writes NOTHING
//   node wattro-close-sites.mjs --numbers=P4,P6 --apply   marks them finished
//
// A number is the site's ID in Wattro (its human_id, "P4"). Only the sites
// named are touched; at most MAX_NUMBERS per run.
//
// Per site it:
//   - skips it unless Wattro holds exactly one project under the number;
//   - skips it if it is finished already;
//   - skips it if a project here is linked to it — the app itself says when
//     one of its own sites is done;
//   - skips it if a machine is booked to it, or Wattro does not say how many
//     are (read again right before the write);
//   - otherwise (with --apply) PATCHes `finished: true` and writes an audit
//     entry (`wattro.siteClosed`).
//
// Only `finished` is ever written; nothing is deleted or renamed in Wattro,
// and the bookings a site had stay in its history. To take one back: open the
// project again in Wattro (the API takes `finished: false` the same way).

import crypto from 'node:crypto'
import { pathToFileURL } from 'node:url'

export const MAX_NUMBERS = 15

export function parseArgs(argv) {
  const arg = argv.find((a) => a.startsWith('--numbers='))
  const numbers = arg
    ? [...new Set(arg.slice('--numbers='.length).split(',').map((n) => n.trim()).filter(Boolean))]
    : []
  return { numbers, apply: argv.includes('--apply') }
}

/**
 * Why a site is left alone — `null` when it may be closed. `linkedIds` holds
 * the Wattro ids the app's own projects are linked to.
 */
export function whyNotClose(site, linkedIds) {
  if (!site) return 'no such site in Wattro'
  if (site.finished) return 'finished already'
  if (linkedIds.has(String(site.id))) return 'a project here is linked to it'
  const machines = site.unfinished_deployment_count
  if (typeof machines !== 'number') return 'Wattro does not say whether a machine is on it'
  if (machines > 0) return `${machines} ${machines === 1 ? 'machine is' : 'machines are'} booked to it`
  return null
}

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

async function main() {
  const { numbers, apply } = parseArgs(process.argv.slice(2))
  if (numbers.length === 0) throw new Error('Give the sites: --numbers=<Wattro ID>,<Wattro ID>,…')
  if (numbers.length > MAX_NUMBERS) throw new Error(`At most ${MAX_NUMBERS} sites per run (got ${numbers.length})`)

  const { default: pg } = await import('pg')
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await db.connect()
  const wattro = wattroApi()

  console.log(apply ? 'APPLY: eligible sites are marked finished in Wattro.' : 'DRY RUN: nothing is written anywhere.')
  const list = await wattro.call('GET', '/project/')
  if (list.status !== 200 || !Array.isArray(list.body)) throw new Error(`Wattro project list answered ${list.status}`)
  const inWattro = list.body
  console.log(`Wattro holds ${inWattro.length} projects (${inWattro.filter((p) => !p.finished).length} open).\n`)

  const tally = { close: 0, closed: 0, skipped: 0, failed: 0 }
  try {
    const links = await db.query(`select "externalId" from "ProjectLink" where system = 'wattro'`)
    const linkedIds = new Set(links.rows.map((r) => String(r.externalId)))

    for (const number of numbers) {
      const found = inWattro.filter((w) => String(w.human_id ?? '') === number)
      if (found.length !== 1) {
        console.log(`SKIP    ${number}: ${found.length === 0 ? 'no such site in Wattro' : 'ambiguous, more than one site'}`)
        tally.skipped++
        continue
      }
      const label = `${number} · ${found[0].name}`
      // Read again: a machine may have been booked to it since the list was fetched.
      const fresh = await wattro.call('GET', `/project/by_human_id/${encodeURIComponent(number)}`)
      if (fresh.status !== 200 || !fresh.body) {
        console.log(`FAILED  ${label}: Wattro answered ${fresh.status} to the lookup`)
        tally.failed++
        if (apply) break
        continue
      }
      const site = { ...found[0], ...fresh.body }
      const why = whyNotClose(site, linkedIds)
      if (why) {
        console.log(`SKIP    ${label}: ${why}`)
        tally.skipped++
        continue
      }

      console.log(`${apply ? 'CLOSE  ' : 'WOULD CLOSE'}  ${label} (machines 0, earlier bookings ${site.finished_deployment_count ?? '?'})`)
      tally.close++
      if (!apply) continue

      const done = await wattro.call('PATCH', `/project/by_human_id/${encodeURIComponent(number)}`, { finished: true })
      if (done.status !== 200 || done.body?.finished !== true) {
        console.log(`FAILED  ${label}: Wattro answered ${done.status}; stopping here`)
        tally.failed++
        break
      }
      try {
        await db.query(
          `insert into "AuditLog"(id, action, entity, "entityId", "newValue") values ($1, 'wattro.siteClosed', 'System', 'wattro', $2)`,
          ['c' + crypto.randomBytes(12).toString('hex'), `closed ${number} "${site.name}" (Wattro id ${site.id})`]
        )
      } catch (e) {
        console.log(`FAILED  ${label}: finished in Wattro, but the audit entry could not be saved: ${e.message}`)
        tally.failed++
        break
      }
      tally.closed++
    }
  } finally {
    await db.end()
  }

  console.log(
    `\n${apply ? `Closed ${tally.closed}` : `Would close ${tally.close}`}, skipped ${tally.skipped}, failed ${tally.failed}.` +
      (apply ? '' : '\nNothing was written. Add --apply to close the ones marked WOULD CLOSE.')
  )
  if (tally.failed > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('Stopped:', e.message)
    process.exit(1)
  })
}
