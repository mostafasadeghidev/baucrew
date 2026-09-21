# BauCrew API, webhooks and MCP

Programs outside the app — an automation such as n8n, a spreadsheet, an AI
assistant — talk to BauCrew through one door: a JSON API over HTTPS, and the
same functions as MCP tools for assistants such as Claude. Both are opened
with an API key that an administrator makes under **Einstellungen → Daten →
Schnittstelle**. The other way round, BauCrew tells automations what happened
through webhooks, set up under **Einstellungen → Daten → Webhooks**.

An automation that connects BauCrew with other systems (a Trello board, a
field-service tool) keeps those systems' credentials to itself: BauCrew only
knows each project's record there, as a *link* (`system` + `externalId`).

## Keys and what they allow

- A key acts as one office user (administrator or manager). It has that
  user's role and financial access: price fields, order values and the
  revenue reports are simply absent when that user may not see them. Crew
  accounts get no key.
- Send the key as a bearer token: `Authorization: Bearer bc_…`. The app keeps
  only its hash; a key is shown once, when it is made, and can be revoked at
  any time on the same page.
- Every write is recorded in the change log under the key's user, with an
  `api.` prefix.
- The app's own pages may call the API with the signed-in session instead of
  a key; nothing else may.

## Conventions

- Base URL: the address of the installation, e.g. `https://baucrew.example`.
- Dates are calendar days, `YYYY-MM-DD`, in UTC. Amounts are euros as plain
  numbers.
- Errors are `{ "error": "<code>", "message": "…" }` with the HTTP status:
  `400` invalid input (with `issues`), `401` no or bad key, `403` not allowed
  for this user, `404` not found, `409` conflict, `500` failure.
- Project statuses: `LEAD`, `QUOTED`, `APPROVED`, `PLANNED`, `IN_PROGRESS`,
  `COMPLETED`, `INVOICED`, `PAID`, `CANCELLED`.

## Routes

| Method | Path | What |
| --- | --- | --- |
| GET | `/api/v1/me` | Who the key acts as, and whether financial data is visible |
| GET | `/api/v1/projects` | Projects, newest first. `q` (name, number, customer, town), `status`, `system` and `externalId` (linked records), `limit` (≤200), `offset` |
| POST | `/api/v1/projects` | Create a project: `name`, `customerId` or `customerName`, optional `status`, `isSub`, `plannedStart`, `plannedEnd`, `dueDate`, `price`, `street`, `postalCode`, `city`, `description` |
| GET | `/api/v1/projects/{id}` | One project by id or number (`2026-0048`): team, vehicles, schedule, plan lines |
| PATCH | `/api/v1/projects/{id}` | Change what is sent: `status`, `name`, `isSub`, `plannedStart`, `plannedEnd`, `dueDate`, `price`, `managerId` or `managerName`, `description`, `street`, `postalCode`, `city`. Absent stays, `null` clears |
| GET | `/api/v1/projects/by-link/{system}/{externalId}` | The project linked to a record of another system |
| PUT | `/api/v1/projects/by-link/{system}/{externalId}` | Update the linked project, or create one and link it — see below. Answers `{ created, project }` |
| PUT | `/api/v1/projects/{id}/links/{system}` | Link the project to a record: `{ "externalId": "…", "url": "…" }`. `409 linkTaken` when the record belongs to another project |
| DELETE | `/api/v1/projects/{id}/links/{system}` | Remove the project's link to that system |
| PUT | `/api/v1/projects/{id}/invoices/{part}` | Mark invoice `1` (`first`, half the order value) or `2` (`final`, what the first left) ready: `{ "number": "…", "amount": 6250 }`, both optional — without `amount` it is suggested. Raises `invoice.ready` the first time (financial access) |
| DELETE | `/api/v1/projects/{id}/invoices/{part}` | Take the ready mark back; nothing is raised |
| GET | `/api/v1/projects/{id}/comments` | The comments on the project, oldest first: `{ id, body, office, createdAt, author, mentions }` |
| POST | `/api/v1/projects/{id}/comments` | Write a comment as the key's user — "Angebot versendet", say: `{ "body": "…", "office": false }`. `@name` in the body names an account; the users named come back in `mentions`. Raises `comment.created` |
| GET | `/api/v1/projects/{id}/defects` | The defects of the project, the open ones first: `{ id, title, description, location, dueDate, open, assignee, reportedAt, reportedBy, resolvedAt, resolvedBy, photos }` |
| POST | `/api/v1/projects/{id}/defects` | Report a defect as the key's user: `{ "title": "…", "location": "…", "description": "…", "dueDate": "2026-10-01", "assigneeId": "…" }`, all but `title` optional; an `assigneeId` nobody has gives nobody. Raises `defect.reported` |
| PATCH | `/api/v1/defects/{id}` | `{ "resolved": true }` puts it right and raises `defect.resolved`; `false` opens it again, silently. Marking what is marked changes nothing |
| POST | `/api/v1/projects/{id}/files` | Add a file: multipart form data, field `file` (PDF, images, Office, CSV, text; ≤25 MB). A file without a type gets one from its name |
| GET | `/api/v1/customers` | Customers by `q` (name, number, company, town), `limit` |
| POST | `/api/v1/customers` | Create a customer: `name`, optional `number` (the customer's number in the office's books), `company`, `contactPerson`, `phone`, `email`, `street`, `postalCode`, `city`, `notes` |
| GET | `/api/v1/customers/{id}` | One customer |
| PATCH | `/api/v1/customers/{id}` | Change what is sent; `null` clears |
| GET | `/api/v1/employees` | Active employees |
| GET | `/api/v1/vehicles` | Active vehicles |
| GET | `/api/v1/schedule` | Entries between `from` and `to` (inclusive), optional `projectId` |
| POST | `/api/v1/schedule` | Put a project on the board: `projectId` (id or number), `date`, optional `endDate` (≤31 days), `saturday`, `sunday`, `employeeIds`, `vehicleIds`, `startTime`, `endTime`, `note` |
| GET | `/api/v1/reports/revenue` | Turnover by month for `year` (financial access) |
| GET | `/api/v1/reports/plan` | Lines of the year plan without a project for `year` (financial access) |

Example:

```bash
curl -H "Authorization: Bearer bc_…" "https://baucrew.example/api/v1/projects?q=Muster&status=IN_PROGRESS"
```

```bash
curl -X POST -H "Authorization: Bearer bc_…" -H "Content-Type: application/json" \
  -d '{"projectId":"2026-0048","date":"2026-09-14","endDate":"2026-09-18","employeeIds":["…"]}' \
  https://baucrew.example/api/v1/schedule
```

Every project carries `statusSince` (when it entered its status — the last
status change, else when the record came into being), its `customer` with
`email` and `phone`, and its `links`. With financial access it also carries
`price`, `orderValue` and `invoices` — the invoices marked ready so far, each
`{ part, kind, number, amount, readyAt }`.

### A project by its record in another system

`PUT /api/v1/projects/by-link/{system}/{externalId}` is the door for a record
of another system — a Trello card above all. `system` is lower case (`trello`,
`wattro`); `externalId` is the record's id there (the card id).

- The linked project is updated with what is sent, like `PATCH`.
- With no linked project, one is made and linked: `name` is required, and
  `customerId` or `customer` (`name`, optional `company`, `contactPerson`,
  `phone`, `email`, `street`, `postalCode`, `city`). The customer is found by
  name or made. Its status is `LEAD` unless `status` says otherwise.
- `list`: the name of the board column the card stands in; the status is read
  from it when no `status` is sent.
- `url`: the record's address. For `trello`, a project imported from the board
  before links existed is found by the card's short link in its address and
  linked from then on.
- Contact details in `customer` are added where the customer has none; what
  the office entered is never overwritten.
- `managerName` is matched against the employees' full names; a name that fits
  nobody, or more than one, sets nothing and comes back in `warnings`.
- Sending the same record twice never makes two projects.

```bash
curl -X PUT -H "Authorization: Bearer bc_…" -H "Content-Type: application/json" \
  -d '{"name":"Musterstraße 12, Fassade","customer":{"name":"Muster GmbH","email":"info@muster.example"},"list":"Anfrage","url":"https://trello.com/c/AbC123xy"}' \
  https://baucrew.example/api/v1/projects/by-link/trello/64f0c0ffee0000000000abcd
```

A project the sheet-led revenue report knows only from the year plan has no
project page; the report's rows carry `projectId: null` for those. Its
`undated` list leaves out finished work from before the old-data cutoff in
Settings and reports how many that was in `undatedHistorical`.

## Webhooks

An administrator adds an endpoint under **Einstellungen → Daten → Webhooks**:
a name, the address (in n8n, the production URL of a *Webhook* node with
method POST) and the events it receives. The page shows the endpoint's signing
secret, sends a test, and lists the recent deliveries with their answers.

| Event | When |
| --- | --- |
| `project.created` | A project was made — in the app, over the API, from an inbox draft |
| `project.status_changed` | Its status changed — by hand, on the board, over the API, or by itself (first scheduled day, completion from the schedule) |
| `project.updated` | Name, customer, site manager, dates, price or order value (follow-on offers), sub-contract flag, address or description changed |
| `project.deleted` | A project was deleted, or merged into another (`mergedInto`) |
| `invoice.ready` | The office marked one of the job's two invoices ready — on the project page or over the API. `data.invoice` is `{ part, kind, number, amount, readyAt }`; marking it again changes it without a second event |
| `defect.reported` | A defect was noted on a site — by the crew from the phone, by the office, or over the API. `data.defect` is `{ id, title, description, location, dueDate, assignee: { id, name }, photos, reportedAt, reportedBy, resolvedAt, resolvedBy }`; `photos` counts what was attached when the event was raised — the crew's photos follow the report by a few seconds |
| `defect.resolved` | A defect was ticked off as put right. Same body, with `resolvedAt` and `resolvedBy`. Opening it again raises nothing |
| `comment.created` | Somebody wrote on the project. `data.comment` is `{ id, body, office, createdAt, author: { id, username, name }, mentions: [{ id, username, name }] }` — the people named with `@`, so an automation can reach them |

The Trello board import in Settings raises no events: what it brings comes
from the board an automation would tell.

A delivery is a `POST` with this body:

```json
{
  "id": "event id, the same for every endpoint",
  "event": "project.status_changed",
  "occurredAt": "2026-09-14T08:12:00.000Z",
  "data": {
    "project": { "id": "…", "number": "2026-0048", "name": "…", "status": "QUOTED", "statusSince": "…",
                 "customer": { "id": "…", "name": "…", "company": null, "contactPerson": null, "email": "…", "phone": null },
                 "manager": null, "address": { "street": null, "postalCode": null, "city": "…" },
                 "plannedStart": null, "plannedEnd": null, "dueDate": null, "actualStart": null, "actualEnd": null,
                 "price": 12500, "orderValue": 12500, "description": null, "isSub": false,
                 "links": [{ "system": "trello", "externalId": "…", "url": "…" }], "invoices": [] },
    "from": "LEAD",
    "to": "QUOTED",
    "actor": { "type": "user", "userId": "…" }
  }
}
```

`project.updated` carries `changes` (`{ "plannedStart": { "from": null, "to":
"2026-10-05" } }`) instead of `from`/`to`. `actor` is who did it: `user`, `api`
(with the key's name — an automation can ignore its own changes coming back),
or `system`. Prices are included: endpoints are set up by administrators.

Headers: `X-BauCrew-Event`, `X-BauCrew-Delivery` (the delivery id) and
`X-BauCrew-Signature: sha256=<hex>` — HMAC-SHA256 of the raw body with the
endpoint's secret. In n8n, switch on *Raw Body* in the Webhook node and compare
in a Code node:

```js
const crypto = require('crypto')
const raw = $input.first().binary.data ? Buffer.from($input.first().binary.data.data, 'base64').toString('utf8') : JSON.stringify($json.body)
const expected = 'sha256=' + crypto.createHmac('sha256', 'whsec_…').update(raw).digest('hex')
if ($json.headers['x-baucrew-signature'] !== expected) throw new Error('bad signature')
return $input.all()
```

Answer with any 2xx within ten seconds. Anything else, or no answer, is tried
again after one minute, five, thirty, two hours, six and a day; after that the
delivery is given up and can be sent again by hand. Deliveries are written
down before they are sent, so a restart loses nothing; a worker in the server
sends what is due once a minute.

## MCP

The same functions are MCP tools at `POST /api/mcp` (Streamable HTTP, one
JSON answer per request, no server-side stream). Authenticate with the same
bearer key. Tools: `list_projects`, `get_project`, `create_project`,
`set_project_status`, `search_customers`, `create_customer`,
`list_employees`, `list_vehicles`, `list_schedule`, `plan_assignment`,
`revenue_by_month`, `plan_gaps`.

Claude Code:

```bash
claude mcp add --transport http baucrew https://baucrew.example/api/mcp --header "Authorization: Bearer bc_…"
```

Claude Desktop reaches servers on the network through the `mcp-remote`
bridge (needs Node.js); in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "baucrew": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://baucrew.example/api/mcp", "--header", "Authorization: Bearer bc_…"]
    }
  }
}
```

The server introduces itself with instructions the assistant reads first:
what the app is, how dates and amounts look, that it acts as the key's user,
and that it should confirm with the person before creating or changing
anything.

## Automations that only hand in drafts

`POST /api/inbound/drafts` is older and separate: it takes a project from an
outside system and lands it as a draft in the inbox, never as a live project,
secured with `INBOUND_API_KEY` from the environment. It stays as it is.
