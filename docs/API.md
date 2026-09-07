# BauCrew API and MCP

Programs outside the app — an automation, a spreadsheet, an AI assistant —
talk to BauCrew through one door: a JSON API over HTTPS, and the same
functions as MCP tools for assistants such as Claude. Both are opened with
an API key that an administrator makes under **Einstellungen → Daten →
Schnittstelle**.

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
| GET | `/api/v1/projects` | Projects, newest first. `q` (name, number, customer, town), `status`, `limit` (≤200), `offset` |
| POST | `/api/v1/projects` | Create a project: `name`, `customerId` or `customerName`, optional `status`, `isSub`, `plannedStart`, `plannedEnd`, `price`, `street`, `postalCode`, `city`, `description` |
| GET | `/api/v1/projects/{id}` | One project by id or number (`2026-0048`): team, vehicles, schedule, plan lines |
| PATCH | `/api/v1/projects/{id}` | Change the status: `{ "status": "IN_PROGRESS" }` |
| GET | `/api/v1/customers` | Customers by `q` (name, company, town), `limit` |
| POST | `/api/v1/customers` | Create a customer: `name`, optional `company`, `contactPerson`, `phone`, `email`, `street`, `postalCode`, `city`, `notes` |
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

A project the sheet-led revenue report knows only from the year plan has no
project page; the report's rows carry `projectId: null` for those. Its
`undated` list leaves out finished work from before the old-data cutoff in
Settings and reports how many that was in `undatedHistorical`.

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
