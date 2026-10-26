#!/usr/bin/env node
// Pulls one complete board file per Trello board — what "Export as JSON"
// gives, plus every comment (Trello's own export stops at the last 1000
// actions) — into local/trello-boards/<slug>.json, in the shape
// src/lib/trello.ts `parseTrelloExport` reads. The files hold real client
// data: local/ is git-excluded and must stay so.
//
//   node --env-file=.env scripts/trello-pull.mjs            all boards of the account
//   node --env-file=.env scripts/trello-pull.mjs --dry      list what would be written
//   node --env-file=.env scripts/trello-pull.mjs <id|slug>  one board
//
// Reads TRELLO_API_KEY and TRELLO_TOKEN (the import Power-Up, see
// docs/TRELLO-RESYNC.md). Only GET requests: nothing is ever written to Trello.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const OUT = path.resolve(process.cwd(), 'local/trello-boards')
const API = 'https://api.trello.com/1'

const args = process.argv.slice(2)
const dry = args.includes('--dry')
const only = args.filter((a) => !a.startsWith('--'))

const key = process.env.TRELLO_API_KEY?.trim()
const token = process.env.TRELLO_TOKEN?.trim()
if (!key || !token) {
  console.error('TRELLO_API_KEY and TRELLO_TOKEN are not set (put them in .env, run with --env-file=.env)')
  process.exit(1)
}
const headers = { Authorization: `OAuth oauth_consumer_key="${key}", oauth_token="${token}"` }

async function get(url) {
  const response = await fetch(API + url, { headers })
  if (!response.ok) throw new Error(`${response.status} ${url.split('?')[0]}`)
  return response.json()
}

/** The file name a board gets: its name, lower-cased, non-word runs as dashes — the same as the 6 Oct pull. */
const slugOf = (name) => name.replace(/[^\w]+/g, '-').toLowerCase()

/** The board ids known from earlier pulls, so a board renamed since still lands in its file. */
async function knownIds() {
  const known = new Map()
  for (const file of await readdir(OUT).catch(() => [])) {
    if (!file.endsWith('.json')) continue
    try {
      const { id, name } = JSON.parse(await readFile(path.join(OUT, file), 'utf8'))
      if (id) known.set(id, { file, name })
    } catch {
      /* not a board file */
    }
  }
  return known
}

const me = await get('/members/me?fields=username')
const known = await knownIds()
let boards = await get('/members/me/boards?filter=all&fields=name,closed,shortLink')
if (only.length) {
  boards = boards.filter((b) => only.some((o) => o === b.id || o === b.shortLink || o === slugOf(b.name) || known.get(b.id)?.file === `${o}.json`))
  if (boards.length === 0) {
    console.error(`no board matches ${only.join(', ')}`)
    process.exit(1)
  }
}
console.log(`${dry ? 'would pull' : 'pulling'} ${boards.length} board(s) as ${me.username} into ${path.relative(process.cwd(), OUT)}/`)

await mkdir(OUT, { recursive: true })
for (const b of boards) {
  const file = known.get(b.id)?.file ?? `${slugOf(b.name)}.json`
  if (dry) {
    console.log(`  ${file.padEnd(48)} ${b.closed ? 'closed' : 'open'}`)
    continue
  }
  // The export's shape: the board with its lists, cards (fields, attachments,
  // Power-Up data), checklists, members, labels and the board's Power-Up data.
  const board = await get(
    `/boards/${b.id}?fields=all&lists=all&list_fields=all&cards=all&card_fields=all&card_attachments=true&card_pluginData=true` +
      `&checklists=all&checklist_fields=all&members=all&member_fields=fullName,username&labels=all&pluginData=true`
  )
  // Every comment, paged back in time; `before=` takes the id of the oldest action seen.
  const comments = []
  let before = null
  for (;;) {
    const page = await get(`/boards/${b.id}/actions?filter=commentCard&limit=1000${before ? `&before=${before}` : ''}`)
    comments.push(...page)
    if (page.length < 1000) break
    before = page[page.length - 1].id
  }
  board.actions = comments
  await writeFile(path.join(OUT, file), JSON.stringify(board))
  console.log(
    `  ${file.padEnd(48)} ${b.closed ? 'closed' : 'open  '} lists ${String(board.lists.length).padStart(2)}  cards ${String(board.cards.length).padStart(3)}` +
      `  comments ${String(comments.length).padStart(4)}  checklists ${board.checklists.length}`
  )
}
