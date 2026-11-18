#!/usr/bin/env node
// Prints the feedback items for a coding agent — the same JSON as "Für Agent
// kopieren" in the app (src/lib/feedback.ts → feedbackHandoff), plus where each
// picture lies on this machine, so the agent can open the screenshots.
//
// The list that counts is the live one: by default the script asks the live
// site over its MCP endpoint, with a "Nur Feedback-Aufgaben" key, and fetches
// the pictures into a folder in the system's temp directory. `--local` reads
// this machine's database instead (a test copy — comments there never reach
// the live list).
//
//   npx tsx --env-file=.env scripts/feedback-export.mjs            open items, readable
//   npx tsx --env-file=.env scripts/feedback-export.mjs --json     open items, JSON
//   npx tsx --env-file=.env scripts/feedback-export.mjs --all      every status
//   npx tsx --env-file=.env scripts/feedback-export.mjs 64 71      these numbers only
//   … --status=TODO,DECISION   … --waiting=agent   … --origin=https://…   … --local
//
// Live needs BAUCREW_LIVE_URL (e.g. https://app.example.com) and
// BAUCREW_LIVE_KEY (the key) in .env; --local needs DATABASE_URL. Read-only
// either way. Run through tsx because it imports the TypeScript rules file.

import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'
import pg from 'pg'
import { OPEN_STATUSES, FEEDBACK_STATUSES, feedbackHandoff } from '../src/lib/feedback.ts'

const args = process.argv.slice(2)
const flag = (name) => args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`))
const value = (name) => flag(name)?.split('=').slice(1).join('=') || ''
const numbers = args.filter((a) => /^#?\d+$/.test(a)).map((a) => Number(a.replace('#', '')))
const statuses = flag('all')
  ? [...FEEDBACK_STATUSES]
  : value('status')
    ? value('status').toUpperCase().split(',').filter((s) => FEEDBACK_STATUSES.includes(s))
    : [...OPEN_STATUSES]
const waiting = value('waiting')
const liveUrl = (process.env.BAUCREW_LIVE_URL ?? '').replace(/\/$/, '')
const liveKey = process.env.BAUCREW_LIVE_KEY ?? ''
const local = Boolean(flag('local'))
const origin = value('origin').replace(/\/$/, '') || (local ? '' : liveUrl)

const handoff = local ? await fromDatabase() : await fromLive()
print(handoff)

/** The live list, over the live site's MCP endpoint. */
async function fromLive() {
  if (!liveUrl || !liveKey) {
    console.error(
      'The live list needs BAUCREW_LIVE_URL and BAUCREW_LIVE_KEY (a "Nur Feedback-Aufgaben" key from Einstellungen → API-Schlüssel) in .env.\n' +
        'Use --local to read this machine\'s database instead.'
    )
    process.exit(1)
  }
  // One status asked for goes to the server; several are filtered here.
  const one = statuses.length === 1 ? statuses[0] : statuses.length === OPEN_STATUSES.length && OPEN_STATUSES.every((s) => statuses.includes(s)) ? 'open' : 'all'
  const answer = await call('list_feedback', {
    ...(numbers.length ? { numbers } : { status: one }),
    ...(waiting ? { waitingOn: waiting } : {}),
    limit: 200,
  })
  const list = JSON.parse(answer.content[0].text)
  if (!numbers.length && one === 'all') list.items = list.items.filter((i) => statuses.includes(i.status))
  const folder = path.join(os.tmpdir(), 'baucrew-feedback')
  await fs.mkdir(folder, { recursive: true })
  for (const item of list.items) {
    item.pageLink = item.pageLink && item.pageLink.startsWith('/') ? `${origin}${item.pageLink}` : item.pageLink
    for (const image of item.images) {
      image.url = image.url.startsWith('/') ? `${origin}${image.url}` : image.url
      const picture = await call('get_feedback_image', { imageId: image.id }).catch(() => null)
      const part = picture?.content?.[0]
      if (part?.type !== 'image') {
        image.file = null
        continue
      }
      const ext = part.mimeType === 'image/jpeg' ? 'jpg' : part.mimeType.split('/')[1]
      image.file = path.join(folder, `${image.id}.${ext}`)
      await fs.writeFile(image.file, Buffer.from(part.data, 'base64'))
    }
  }
  return list
}

/** One tool of the live site, as its MCP endpoint answers it. */
async function call(name, args) {
  const res = await fetch(`${liveUrl}/api/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${liveKey}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  if (res.status === 401) {
    console.error(`${liveUrl} refused the key (401): revoked, or not a key of this installation.`)
    process.exit(1)
  }
  const body = await res.json()
  if (body.error) throw new Error(`${name}: ${body.error.message}`)
  if (body.result.isError) throw new Error(`${name}: ${body.result.content[0].text}`)
  return body.result
}

/** This machine's database: the test copy. */
async function fromDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set (run with --env-file=.env)')
    process.exit(1)
  }
  const storage = process.env.FILE_STORAGE_DIR || path.join(process.cwd(), 'storage')

  // Prisma writes its timestamps as UTC without a zone; read them back the same way.
  pg.types.setTypeParser(1114, (v) => new Date(`${v.replace(' ', 'T')}Z`))

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    const where = numbers.length ? 'i."number" = ANY($1::int[])' : 'i."status"::text = ANY($1::text[])'
    const params = [numbers.length ? numbers : statuses]
    let sql = `SELECT i.*, u."username", e."firstName", e."lastName"
                 FROM "FeedbackItem" i
                 LEFT JOIN "User" u ON u."id" = i."authorId"
                 LEFT JOIN "Employee" e ON e."userId" = u."id"
                WHERE ${where}`
    if (waiting) {
      params.push(waiting === 'none' ? null : waiting)
      sql += waiting === 'none' ? ' AND i."waitingOn" IS NULL AND $2::text IS NULL' : ' AND i."waitingOn" = $2'
    }
    sql += ' ORDER BY i."number"'
    const items = (await client.query(sql, params)).rows
    const ids = items.map((i) => i.id)
    const nameOf = (r) => (r.firstName || r.lastName ? `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() : r.username) || null
    const person = (id, r) => (id ? { id, name: nameOf(r) ?? 'unknown' } : null)
    const rows = async (q) => (await client.query(q, [ids])).rows
    const attachments = await rows(`SELECT * FROM "FeedbackAttachment" WHERE "itemId" = ANY($1) ORDER BY "createdAt"`)
    const notes = await rows(
      `SELECT n.*, u."username", e."firstName", e."lastName" FROM "FeedbackNote" n LEFT JOIN "User" u ON u."id" = n."authorId" LEFT JOIN "Employee" e ON e."userId" = u."id" WHERE n."itemId" = ANY($1) ORDER BY n."createdAt" DESC`
    )
    const changes = await rows(
      `SELECT c.*, u."username", e."firstName", e."lastName" FROM "FeedbackStatusChange" c LEFT JOIN "User" u ON u."id" = c."changedById" LEFT JOIN "Employee" e ON e."userId" = u."id" WHERE c."itemId" = ANY($1) ORDER BY c."createdAt"`
    )
    const files = new Map(attachments.map((a) => [a.id, path.join(storage, a.path)]))
    const dto = items.map((i) => ({
      id: i.id,
      number: i.number,
      title: i.title,
      comment: i.comment,
      status: i.status,
      source: i.source,
      waitingOn: i.waitingOn,
      officeOnly: i.officeOnly,
      page: i.page,
      anchor: i.anchor,
      metadata: i.metadata,
      context: i.context,
      suggestion: i.suggestion,
      decision: i.decision,
      beforeText: i.beforeText,
      afterText: i.afterText,
      completionNote: i.completionNote,
      version: i.version,
      author: person(i.authorId, i),
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      attachments: attachments
        .filter((a) => a.itemId === i.id)
        .map((a) => ({ id: a.id, kind: a.kind, filename: a.filename, mimeType: a.mimeType, size: a.size, width: a.width, height: a.height, url: `/api/feedback/attachments/${a.id}` })),
      notes: notes
        .filter((n) => n.itemId === i.id)
        .map((n) => ({ id: n.id, choice: n.choice, body: n.body, itemVersion: n.itemVersion, evidence: n.evidence, author: person(n.authorId, n), createdAt: n.createdAt.toISOString() })),
      changes: changes
        .filter((c) => c.itemId === i.id)
        .map((c) => ({ id: c.id, from: c.fromStatus, to: c.toStatus, by: person(c.changedById, c), createdAt: c.createdAt.toISOString() })),
    }))

    const handoff = feedbackHandoff(dto, { origin })
    for (const item of handoff.items) for (const image of item.images) image.file = files.get(image.id) ?? null

    return handoff
  } finally {
    await client.end()
  }
}

/** Readable for a person (and an agent), or the JSON. */
function print(handoff) {
  if (flag('json')) {
    console.log(JSON.stringify(handoff, null, 2))
  } else {
    console.log(`${handoff.items.length} item(s) · ${local ? 'local copy' : liveUrl} · ${numbers.length ? `#${numbers.join(', #')}` : statuses.join(', ')}${waiting ? ` · waiting on ${waiting}` : ''}\n`)
    for (const item of handoff.items) {
      console.log(`#${item.number} [${item.status}${item.waitingOn ? ` · waits on ${item.waitingOn}` : ''}] ${item.title}`)
      if (item.comment && item.comment !== item.title) console.log(indent(item.comment))
      if (item.page) console.log(`  page: ${item.page}${item.anchor?.selector ? `  element: ${item.anchor.selector}` : ''}`)
      if (item.anchor?.text) console.log(`  selected: ${item.anchor.text.slice(0, 160)}`)
      if (item.decisionNeeded) console.log(`  open question: ${item.decisionNeeded}`)
      if (item.proposal) console.log(`  proposal: ${item.proposal.suggestion || '(before/after only)'}`)
      for (const image of item.images) console.log(`  image (${image.kind}): ${image.file}`)
      for (const note of item.notes)
        console.log(`  ${note.choice}${note.choice === 'note' ? '' : note.evidenceMatchesCurrent ? ' (current proposal)' : ' (older proposal)'} — ${note.author ?? '?'}: ${note.body}`)
      if (item.context?.refs?.length) console.log(`  refs: ${item.context.refs.join(', ')}`)
      console.log('')
    }
  }
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}
