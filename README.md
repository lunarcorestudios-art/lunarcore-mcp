# Lunarcore OS MCP

MCP server for the Lunarcore Studios operating system. Clients call stable studio verbs (`client_list`, `task_create`, `pipeline_summary`, and the rest below). Those verbs sit on a `StudioOs` port so ClickUp and Google can be plugged in later without renaming tools.

v1 answers every tool from an in-memory stub. Successful payloads include `source: "stub"`. Nothing is written to ClickUp or Google, and the stub works with no API tokens. Data lives in the server process and resets when that process exits.

## Layout

```
src/index.ts                 stdio entrypoint
src/server/create-server.ts  McpServer factory and instructions
src/tools/                   one module per area, registered through a shared helper
src/adapters/memory/         working in-memory StudioOs
src/adapters/clickup/        typed placeholder plus the planned ClickUp resource map
src/adapters/google/         typed placeholder plus the planned Docs, Drive, and Calendar map
src/types/                   entities, inputs, and the StudioOs port
src/config/env.ts            env parsing and optional .env loading
```

Tools depend on `StudioOs`, not on a vendor SDK. `createStudio()` returns the memory adapter unless `LUNARCORE_ADAPTER` is `clickup` or `google`. Those two values construct the matching placeholder and then refuse to start, so an unfinished adapter cannot be mistaken for live data.

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

Check the compiled server, including tool listing and stub calls:

```bash
npm run build && npm run smoke
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
| `LUNARCORE_ADAPTER` | `memory` (default), `clickup`, or `google`. `stub` is accepted as an alias of `memory`. `clickup` and `google` refuse to start until those adapters are implemented. |
| `LUNARCORE_WORKSPACE_NAME` | Workspace label. Default `Lunarcore Studios`. |
| `LUNARCORE_ACTOR_NAME` | Actor name returned by `whoami`. Default `Lunarcore Operator`. |
| `LUNARCORE_ACTOR_EMAIL` | Actor email. If it matches a member, `whoami` uses that member id. |
| `LUNARCORE_ACTOR_ROLE` | Actor role. Default `producer`. |
| `CLICKUP_API_TOKEN` | Future ClickUp adapter. Not required for the stub. |
| `CLICKUP_TEAM_ID` | Future ClickUp workspace id. Not required for the stub. |
| `GOOGLE_CLIENT_ID` | Future Google OAuth client. Not required for the stub. |
| `GOOGLE_CLIENT_SECRET` | Future Google OAuth secret. Not required for the stub. |
| `GOOGLE_REFRESH_TOKEN` | Future Google refresh token. Not required for the stub. |

ClickUp is the planned system of record for clients, projects, tasks, pipeline, members, and time. Google is the planned system of record for documents and reminders. The split is written down in `src/adapters/clickup/mapping.ts` and `src/adapters/google/mapping.ts`.

## Response shape

Successful calls return MCP text and `structuredContent` with the same JSON object:

```json
{
  "ok": true,
  "source": "stub",
  "data": {}
}
```

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

1. Replace `createClickUpStudio()` with a client that uses `CLICKUP_API_TOKEN` and `CLICKUP_TEAM_ID`, following `CLICKUP_MAPPING`.
2. Replace `createGoogleStudio()` with Docs, Drive, and Calendar calls, following `GOOGLE_MAPPING`.
3. Add a composite `StudioOs` that routes delivery, pipeline, members, and time to ClickUp, and docs plus reminders to Google. Keep the tool names in `src/tools/` unchanged.
4. Treat ClickUp and Google as the systems of record so a restart does not depend on process memory.
