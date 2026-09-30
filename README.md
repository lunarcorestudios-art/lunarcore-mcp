# Lunarcore OS MCP

MCP server for the Lunarcore Studios operating system. Clients call stable studio verbs (`client_list`, `task_create`, `pipeline_summary`, and the rest below). Those verbs sit on a `StudioOs` port so the memory stub and ClickUp share tool names.

`LUNARCORE_ADAPTER=memory` (the default) answers every tool from an in-memory stub. Successful payloads include `source: "stub"`. Nothing is written to ClickUp or Google, and the stub works with no API tokens. Data lives in the server process and resets when that process exits.

`LUNARCORE_ADAPTER=clickup` reads and writes the Lunarcore ClickUp workspace. Successful payloads include `source: "clickup"`. It requires `CLICKUP_API_TOKEN` and `CLICKUP_TEAM_ID` at startup. Google is still a typed placeholder and refuses to start.

## Layout

```
src/index.ts                 stdio entrypoint
src/server/create-server.ts  McpServer factory and instructions
src/tools/                   one module per area, registered through a shared helper
src/adapters/memory/         working in-memory StudioOs
src/adapters/clickup/        live ClickUp StudioOs (Client Work folders, lists, and tasks)
src/adapters/google/         typed placeholder plus the planned Docs, Drive, and Calendar map
src/types/                   entities, inputs, and the StudioOs port
src/config/env.ts            env parsing and optional .env loading
```

Tools depend on `StudioOs`, not on a vendor SDK. `createStudio()` returns the memory adapter unless `LUNARCORE_ADAPTER` is `clickup` or `google`. `clickup` constructs the live adapter and refuses to start when `CLICKUP_API_TOKEN` or `CLICKUP_TEAM_ID` is missing. `google` is still a placeholder and refuses to start.

## Requirements

- Node.js 20 or newer

## Run locally

```bash
npm install
npm run build
npm start
```

`npm start` speaks MCP over stdin/stdout and waits for a client. Logs go to stderr. A banner that includes `stdio ready` means the process is up.

For TypeScript without a build step:

```bash
npm run dev
```

Check the compiled server, including tool listing, stub calls, and the ClickUp adapter against an in-process fake API:

```bash
npm run build && npm run smoke
```

Smoke always exercises the memory adapter. The ClickUp section uses a fake API, and a read-only live check runs only when `CLICKUP_API_TOKEN` and `CLICKUP_TEAM_ID` are already set. That live check lists clients and members; it does not create records.

Run against ClickUp:

```bash
export LUNARCORE_ADAPTER=clickup
export CLICKUP_API_TOKEN="pk_..."   # personal token; do not commit it
export CLICKUP_TEAM_ID=9016194264
npm run build
npm start
```

## Connect as an MCP server (stdio)

Point the host at the built entrypoint. Example Cursor config (`~/.cursor/mcp.json` or the project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "lunarcore-os": {
      "command": "node",
      "args": ["/absolute/path/to/lunarcore-mcp/dist/index.js"],
      "env": {
        "LUNARCORE_ADAPTER": "memory"
      }
    }
  }
}
```

Development equivalent, using `tsx`:

```json
{
  "mcpServers": {
    "lunarcore-os": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/lunarcore-mcp/src/index.ts"]
    }
  }
}
```

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) can list and call tools without a host:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This server uses `@modelcontextprotocol/sdk` with `McpServer.registerTool` and `StdioServerTransport`. Zod schemas are the tool inputs. The SDK rejects arguments that do not match before the handler runs. There is no HTTP API.

## Environment

Copy `.env.example` to `.env` if you want `npm start` to pick up local values. Variables already set by the host are left alone. Tokens are optional for the stub. `workspace_context` reports whether each credential is present and never returns the secret itself.

| Variable | Purpose |
| --- | --- |
| `LUNARCORE_ADAPTER` | `memory` (default), `clickup`, or `google`. `stub` is accepted as an alias of `memory`. `clickup` requires the ClickUp variables below. `google` refuses to start until that adapter is implemented. |
| `LUNARCORE_WORKSPACE_NAME` | Workspace label. Default `Lunarcore Studios`. |
| `LUNARCORE_ACTOR_NAME` | Actor name returned by `whoami`. Default `Lunarcore Operator`. |
| `LUNARCORE_ACTOR_EMAIL` | Actor email. If it matches a member, `whoami` uses that member id. |
| `LUNARCORE_ACTOR_ROLE` | Actor role. Default `producer`. |
| `CLICKUP_API_TOKEN` | ClickUp personal API token. Required for `LUNARCORE_ADAPTER=clickup`. Sent as the raw `Authorization` header. Not required for the stub. |
| `CLICKUP_TEAM_ID` | ClickUp workspace / team id. Lunarcore is `9016194264`. Required for the ClickUp adapter. |
| `CLICKUP_SPACE_ID` | Optional. Client space override. When unset, the adapter uses the space named `Client Work` (known id `90166903137`). |
| `GOOGLE_CLIENT_ID` | Future Google OAuth client. Not required for the stub. |
| `GOOGLE_CLIENT_SECRET` | Future Google OAuth secret. Not required for the stub. |
| `GOOGLE_REFRESH_TOKEN` | Future Google refresh token. Not required for the stub. |

ClickUp is the system of record for clients, projects, tasks, milestones, members, and delivery status. Google remains the planned system of record for documents and reminders. Pipeline and time are not mapped onto ClickUp in this version. The split is written down in `src/adapters/clickup/mapping.ts` and `src/adapters/google/mapping.ts`.

## ClickUp mapping

The adapter talks to `https://api.clickup.com/api/v2` with `Authorization` set to the raw personal token. Requests are spaced (about 600ms) and HTTP 429 responses honor `Retry-After`. The Client Work folder tree is cached for 60 seconds and refreshed after writes.

| Studio | ClickUp |
| --- | --- |
| Client | Folder in the **Client Work** space. Id is the folder id. Status is `active` unless the folder is archived. Names starting with `_TEMPLATE` (including `_TEMPLATE New Client`) are not clients. |
| Project | Each list in a client folder. `Active Deliverables`, `Content Calendar`, `Ad Campaigns`, `Revisions`, `Files & References`, and other ordinary lists are projects. Names starting with `_archive`, and lists ClickUp has archived, are hidden unless the caller filters `status=archived`, passes a query that matches the list, or gets the list by id. A non-archived list reads back as `active`. `planning` is accepted on create and reads back as `active`. |
| Task | ClickUp task on that list, excluding milestone tasks. `milestoneId` is the parent when the parent is a milestone task. |
| Milestone | A task tagged `milestone`, or a task with an affirmative custom field whose name contains "milestone". Writes create or update a task with the `milestone` tag. |
| Comment | ClickUp task comment, posted as the token user. |
| Member | User on `GET /team/{team_id}`. Role is `owner`, `admin`, `member`, or `guest`. |
| Delivery status | Rollup of that list's milestones and tasks. Health is `blocked` when a task or milestone is blocked, else `at_risk` when a milestone is overdue, else `on_track`. Lists have no delivered state. |

Task status is read from the ClickUp status type and name: `closed`/`done` → `done`, a name like blocked/stuck/waiting/on hold → `blocked`, `custom` or an in-progress name → `in_progress`, otherwise `todo`. Writes pick a list status with a matching name, then a matching type. Priority is ClickUp's scale: urgent 1, high 2, normal 3, low 4.

Client folders only store a name, so `industry`, `primaryContact`, `notes`, and a non-active status return `not_implemented`. Lists store a name, description (`content`), start date, and due date. `phase` and archiving return `not_implemented`.

`whoami` is the ClickUp user for the token. `workspace_context` uses the team name, `persistence: "external"`, and `source: "clickup"`. Its task count is the sum of ClickUp `task_count` on the default lists. Milestone, comment, pipeline, doc, reminder, time, and link totals stay 0 because ClickUp has no cheap counter for them. `search` covers clients, projects, members, tasks, and milestones. `link_entities` links two tasks; ClickUp does not store the relation label. Leads, proposals, docs, reminders, and time return `not_implemented` rather than invented records.

## Response shape

Successful calls return MCP text and `structuredContent` with the same JSON object:

```json
{
  "ok": true,
  "source": "stub",
  "data": {}
}
```

`source` is `stub` for the memory adapter and `clickup` for live ClickUp data.

Domain failures (missing records, empty patches, bad links) use the same envelope with `ok: false`, an `error.code` of `not_found`, `invalid`, or `not_implemented`, and MCP `isError: true`. Schema mismatches are rejected by the SDK before the handler runs.

List results use `{ "items": [], "total": 0 }`. `total` is the full filter count. `limit` defaults to 50 and caps at 200.

The memory adapter is seeded with a small studio: Helios Atelier, Northline Audio, a qualified Vesper Ceramics lead, two members, and an open draft proposal. The Helios film project is blocked on a temp score task, which `delivery_status` reports.

## Tools

### Clients

| Tool | What it does |
| --- | --- |
| `client_list` | List clients. Optional `status`, `query`, `limit`. |
| `client_get` | Get one client by `id`. |
| `client_create` | Create a client. Status defaults to `active`. |
| `client_update` | Patch a client. At least one field besides `id` is required. |
| `client_search` | Text search across name, industry, notes, and primary contact. |

### Projects and delivery

| Tool | What it does |
| --- | --- |
| `project_list` | List projects. Optional `clientId`, `status`, `query`, `limit`. |
| `project_get` | Get one project by `id`. |
| `project_create` | Create a project for an existing client. Status defaults to `planning`. |
| `project_update` | Patch a project. |
| `milestone_list` | List milestones for a `projectId`, earliest due date first. |
| `milestone_upsert` | Update by `id`, or create/update by `projectId` plus `name`. |
| `task_list` | List tasks. Optional project, milestone, assignee, status, and query. |
| `task_get` | Get one task and its comments. |
| `task_create` | Create a task. Status defaults to `todo`, priority to `normal`. |
| `task_update` | Patch a task. It stays on its project. |
| `task_comment` | Add a comment. Optional `authorId`. |
| `delivery_status` | Roll up milestones and tasks. Health is `delivered`, else `blocked`, else `at_risk` when a milestone is overdue, else `on_track`. |

### Pipeline

| Tool | What it does |
| --- | --- |
| `lead_list` | List leads. Optional `stage`, `ownerId`, `query`, `limit`. |
| `lead_get` | Get one lead by `id`. |
| `lead_create` | Create a lead. Stage defaults to `new`. |
| `lead_update` | Patch a lead. |
| `proposal_list` | List proposals. Optional lead, client, status, and query. |
| `proposal_get` | Get one proposal by `id`. |
| `proposal_create` | Create a proposal. Status defaults to `draft`, currency to `USD`. |
| `pipeline_summary` | Counts by lead stage and proposal status, plus open draft/sent amounts. |

### People and ops

| Tool | What it does |
| --- | --- |
| `member_list` | List members. Optional `active`, `query`, `limit`. |
| `member_resolve` | Resolve by name, email, or role. Exact email wins. |
| `doc_search` | Search document title and body. Optional client, project, and kind. |
| `doc_get` | Get one document by `id`. |
| `doc_create` | Create a document. Kind defaults to `note`. |
| `reminder_create` | Create a reminder. `relatedKind` and `relatedId` are paired. |
| `reminder_list` | List reminders, soonest due first. |
| `time_log` | Log minutes for a member. Date defaults to today (UTC). Max 1440 minutes. |
| `time_summary` | Sum minutes by member and project. Optional inclusive `from` / `to`. |

### OS glue

| Tool | What it does |
| --- | --- |
| `search` | Cross-record search. Optional `kinds` filter. |
| `whoami` | Actor for this process. |
| `workspace_context` | Workspace name, counts, adapter, and which credentials are present. |
| `link_entities` | Link two records. The same from, to, and relation returns the existing link. |

## Next steps for live adapters

1. Replace `createGoogleStudio()` with Docs, Drive, and Calendar calls, following `GOOGLE_MAPPING`.
2. Add a composite `StudioOs` that routes delivery and members to ClickUp, and docs plus reminders to Google. Keep the tool names in `src/tools/` unchanged.
3. Decide whether pipeline and time should grow a real ClickUp home. v1 leaves both `not_implemented`.
