import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { createClickUpStudio } from "../dist/adapters/clickup/clickup-studio.js";
import { createStudio } from "../dist/adapters/create-studio.js";
import { createGoogleStudio } from "../dist/adapters/google/google-studio.js";
import { loadDotEnv } from "../dist/config/env.js";
import { TOOL_NAMES } from "../dist/tools/index.js";
import { StudioError } from "../dist/types/errors.js";

const EXPECTED_TOOLS = [
  "client_list",
  "client_get",
  "client_create",
  "client_update",
  "client_search",
  "project_list",
  "project_get",
  "project_create",
  "project_update",
  "milestone_list",
  "milestone_upsert",
  "task_list",
  "task_get",
  "task_create",
  "task_update",
  "task_comment",
  "delivery_status",
  "lead_list",
  "lead_get",
  "lead_create",
  "lead_update",
  "proposal_list",
  "proposal_get",
  "proposal_create",
  "pipeline_summary",
  "member_list",
  "member_resolve",
  "doc_search",
  "doc_get",
  "doc_create",
  "reminder_create",
  "reminder_list",
  "time_log",
  "time_summary",
  "search",
  "whoami",
  "workspace_context",
  "link_entities",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function day(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

type Envelope =
  | { ok: true; source: string; data: Record<string, unknown> }
  | { ok: false; source: string; error: { code: string; message: string } };

function readEnvelope(result: {
  content: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}): Envelope {
  const text = result.content.find((block) => block.type === "text")?.text;
  assert(text, "tool result is missing text content");
  const parsed = JSON.parse(text) as Envelope;
  assert(result.structuredContent, "tool result is missing structuredContent");
  assert(
    JSON.stringify(result.structuredContent) === JSON.stringify(parsed),
    "structuredContent does not match text JSON",
  );
  return parsed;
}

async function connect(env: Record<string, string>): Promise<{
  client: Client;
  close: () => Promise<void>;
  stderr: () => string;
}> {
  let stderr = "";
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["dist/index.js"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: { ...getDefaultEnvironment(), ...env },
  });
  transport.stderr?.setEncoding("utf8");
  transport.stderr?.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const client = new Client({ name: "lunarcore-smoke", version: "0.0.0" });
  await client.connect(transport);
  return {
    client,
    stderr: () => stderr,
    close: async () => {
      await client.close();
    },
  };
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await client.callTool({ name, arguments: args });
  const body = readEnvelope(result);
  if (!body.ok) {
    throw new Error(`${name} failed: ${body.error.code} ${body.error.message}`);
  }
  assert(body.source === "stub", `${name} source was ${body.source}`);
  assert(result.isError !== true, `${name} set isError on success`);
  return body.data;
}

async function fail(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  code: string,
): Promise<void> {
  const result = await client.callTool({ name, arguments: args });
  const body = readEnvelope(result);
  assert(body.ok === false, `${name} should have failed`);
  assert(result.isError === true, `${name} should set isError`);
  assert(body.source === "stub", `${name} error source was ${body.source}`);
  assert(body.error.code === code, `${name} code was ${body.error.code}: ${body.error.message}`);
}

function sameNames(actual: readonly string[], expected: readonly string[]): void {
  const actualSet = [...actual].sort();
  const expectedSet = [...expected].sort();
  assert(
    JSON.stringify(actualSet) === JSON.stringify(expectedSet),
    `tool names differ\n actual: ${actualSet.join(", ")}\n expected: ${expectedSet.join(", ")}`,
  );
}

async function exerciseServer(): Promise<void> {
  const session = await connect({ LUNARCORE_ADAPTER: "memory" });
  try {
    const listed: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await session.client.listTools(cursor ? { cursor } : undefined);
      for (const tool of page.tools) {
        assert(tool.description && tool.description.length > 0, `${tool.name} is missing a description`);
        assert(tool.inputSchema.type === "object", `${tool.name} input schema is not an object`);
        listed.push(tool.name);
      }
      const create = page.tools.find((tool) => tool.name === "client_create");
      if (create) assert(create.inputSchema.required?.includes("name"), "client_create should require name");
      const list = page.tools.find((tool) => tool.name === "client_list");
      if (list) assert(list.annotations?.readOnlyHint === true, "client_list should be read-only");
      cursor = page.nextCursor;
    } while (cursor);
    sameNames(listed, EXPECTED_TOOLS);
    sameNames(TOOL_NAMES, EXPECTED_TOOLS);

    const who = await call(session.client, "whoami");
    const actor = who.actor as { email: string; name: string };
    assert(actor.email === "operator@lunarcore.studio", `unexpected actor ${actor.email}`);
    assert(actor.name === "Lunarcore Operator", `unexpected actor name ${actor.name}`);

    const context = await call(session.client, "workspace_context");
    const workspace = context.workspace as { adapter: string; name: string };
    assert(workspace.adapter === "stub", "workspace adapter should be stub");
    assert(workspace.name === "Lunarcore Studios", "unexpected workspace name");
    assert(context.persistence === "process_memory", "stub should be process memory");
    const integrations = context.integrations as {
      clickup: { configured: boolean };
      google: { configured: boolean };
    };
    assert(integrations.clickup.configured === false, "clickup should be unconfigured");
    assert(integrations.google.configured === false, "google should be unconfigured");

    const clients = await call(session.client, "client_list", { query: "helios" });
    const clientItems = clients.items as Array<{ id: string; name: string }>;
    assert(clientItems.some((item) => item.id === "cli_helios"), "seeded Helios client missing");

    const fetched = await call(session.client, "client_get", { id: "cli_helios" });
    assert((fetched.client as { name: string }).name === "Helios Atelier", "client_get name mismatch");
    await fail(session.client, "client_get", { id: "cli_missing" }, "not_found");

    const created = await call(session.client, "client_create", {
      name: "Aster Press",
      industry: "publishing",
      primaryContact: { name: "Noor Hale", email: "noor@aster.example" },
    });
    const createdClient = created.client as { id: string; status: string };
    assert(createdClient.status === "active", "new client should default to active");
    const updated = await call(session.client, "client_update", {
      id: createdClient.id,
      status: "paused",
    });
    assert((updated.client as { status: string }).status === "paused", "client status did not update");
    await fail(session.client, "client_update", { id: createdClient.id }, "invalid");
    const found = await call(session.client, "client_search", { query: "aster" });
    assert(
      (found.items as Array<{ id: string }>).some((item) => item.id === createdClient.id),
      "client_search missed the new client",
    );

    const projects = await call(session.client, "project_list", { clientId: "cli_helios" });
    const helios = (projects.items as Array<{ id: string; name: string }>).find((item) => item.id === "prj_helios_ss26");
    assert(helios, "seeded Helios project missing");
    const project = await call(session.client, "project_create", {
      clientId: createdClient.id,
      name: "Aster catalog",
      dueDate: day(30),
    });
    const projectId = (project.project as { id: string; status: string }).id;
    assert((project.project as { status: string }).status === "planning", "project should default to planning");

    const late = await call(session.client, "project_create", {
      clientId: createdClient.id,
      name: "Aster overdue",
      status: "active",
    });
    const lateId = (late.project as { id: string }).id;
    await call(session.client, "milestone_upsert", {
      projectId: lateId,
      name: "Missed review",
      dueDate: day(-1),
    });
    const atRisk = await call(session.client, "delivery_status", { projectId: lateId });
    assert(atRisk.health === "at_risk", `expected at_risk health, got ${String(atRisk.health)}`);

    const firstMilestone = await call(session.client, "milestone_upsert", {
      projectId,
      name: "Cover lock",
      dueDate: day(12),
    });
    const milestoneId = (firstMilestone.milestone as { id: string }).id;
    const secondMilestone = await call(session.client, "milestone_upsert", {
      projectId,
      name: "Cover lock",
      status: "in_progress",
    });
    assert((secondMilestone.milestone as { id: string }).id === milestoneId, "upsert by name created a duplicate");
    assert((secondMilestone.milestone as { status: string }).status === "in_progress", "upsert did not update status");

    const task = await call(session.client, "task_create", {
      projectId,
      milestoneId,
      title: "Select type",
      assigneeId: "mem_iris",
    });
    const taskId = (task.task as { id: string; status: string }).id;
    assert((task.task as { status: string }).status === "todo", "task should default to todo");
    const commented = await call(session.client, "task_comment", {
      taskId,
      body: "Use the display face.",
      authorId: "mem_iris",
    });
    assert((commented.comment as { body: string }).body === "Use the display face.", "comment body mismatch");
    const taskAfter = await call(session.client, "task_update", { id: taskId, status: "done" });
    assert((taskAfter.task as { status: string }).status === "done", "task status did not update");
    const comments = (taskAfter.comments as Array<{ body: string }>) ?? [];
    assert(comments.some((comment) => comment.body === "Use the display face."), "task_get dropped the comment");

    const blocked = await call(session.client, "delivery_status", { projectId: "prj_helios_ss26" });
    assert(blocked.health === "blocked", `expected blocked health, got ${String(blocked.health)}`);
    const blockedTasks = (blocked.tasks as { blocked: Array<{ id: string }> }).blocked;
    assert(blockedTasks.some((item) => item.id === "tsk_helios_music"), "blocked task missing from rollup");
    await call(session.client, "project_update", { id: "prj_helios_ss26", status: "delivered" });
    const delivered = await call(session.client, "delivery_status", { projectId: "prj_helios_ss26" });
    assert(delivered.health === "delivered", "delivered project should report delivered health");
    await call(session.client, "project_update", { id: "prj_helios_ss26", status: "active" });

    const lead = await call(session.client, "lead_create", {
      name: "Field Notes",
      email: "hello@fieldnotes.example",
      stage: "proposal",
    });
    const leadId = (lead.lead as { id: string }).id;
    await call(session.client, "lead_update", { id: leadId, ownerId: "mem_julian" });
    await call(session.client, "proposal_create", {
      title: "Field Notes short",
      leadId,
      amount: 2000,
      status: "sent",
    });
    const summary = await call(session.client, "pipeline_summary");
    const open = summary.proposals as { openAmountByCurrency: Array<{ currency: string; amount: number }> };
    const usd = open.openAmountByCurrency.find((row) => row.currency === "USD");
    assert(usd && usd.amount === 20000, `expected 20000 USD open, got ${JSON.stringify(open)}`);

    const members = await call(session.client, "member_resolve", { query: "iris@lunarcore.studio" });
    const matches = members.matches as Array<{ id: string }>;
    assert(matches[0]?.id === "mem_iris", "exact email should resolve Iris first");

    const docs = await call(session.client, "doc_search", { query: "cutdown" });
    assert(
      (docs.items as Array<{ id: string }>).some((item) => item.id === "doc_helios_brief"),
      "doc_search missed the Helios brief",
    );
    await fail(
      session.client,
      "doc_create",
      {
        title: "Wrong home",
        body: "A Helios project cannot be filed on another client.",
        clientId: createdClient.id,
        projectId: "prj_helios_ss26",
      },
      "invalid",
    );
    const doc = await call(session.client, "doc_create", {
      title: "Aster notes",
      body: "Catalog grid and a quiet cover.",
      clientId: createdClient.id,
      projectId,
      kind: "note",
    });
    const docId = (doc.doc as { id: string }).id;
    const loaded = await call(session.client, "doc_get", { id: docId });
    assert((loaded.doc as { title: string }).title === "Aster notes", "doc_get mismatch");

    const reminder = await call(session.client, "reminder_create", {
      title: "Aster check-in",
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      assigneeId: "mem_julian",
      relatedKind: "project",
      relatedId: projectId,
    });
    const reminderId = (reminder.reminder as { id: string }).id;
    const reminders = await call(session.client, "reminder_list", { assigneeId: "mem_julian" });
    assert(
      (reminders.items as Array<{ id: string }>).some((item) => item.id === reminderId),
      "new reminder missing from list",
    );

    const before = await call(session.client, "time_summary", { memberId: "mem_iris" });
    const beforeMinutes = before.totalMinutes as number;
    await call(session.client, "time_log", {
      memberId: "mem_iris",
      projectId,
      minutes: 30,
      note: "Cover review",
    });
    const after = await call(session.client, "time_summary", { memberId: "mem_iris" });
    assert(after.totalMinutes === beforeMinutes + 30, "time summary did not include the new entry");

    const hits = await call(session.client, "search", { query: "Helios", kinds: ["client", "doc"] });
    const kinds = new Set((hits.items as Array<{ kind: string }>).map((item) => item.kind));
    assert(kinds.has("client") && kinds.has("doc"), `search kinds were ${[...kinds].join(",")}`);
    assert(!kinds.has("task"), "kind filter leaked tasks");

    const link = await call(session.client, "link_entities", {
      fromKind: "doc",
      fromId: docId,
      toKind: "project",
      toId: projectId,
      relation: "notes_for",
    });
    const linkId = (link.link as { id: string }).id;
    const again = await call(session.client, "link_entities", {
      fromKind: "doc",
      fromId: docId,
      toKind: "project",
      toId: projectId,
      relation: "notes_for",
    });
    assert((again.link as { id: string }).id === linkId, "repeat link should be idempotent");
    await fail(
      session.client,
      "link_entities",
      { fromKind: "doc", fromId: docId, toKind: "doc", toId: docId, relation: "self" },
      "invalid",
    );
    await fail(
      session.client,
      "link_entities",
      { fromKind: "client", fromId: "cli_missing", toKind: "project", toId: projectId, relation: "for" },
      "not_found",
    );

    const invalid = await session.client.callTool({ name: "client_create", arguments: {} });
    assert(invalid.isError === true, "client_create without a name should fail validation");
    const invalidText = invalid.content.find((block) => block.type === "text")?.text ?? "";
    assert(/validation|required|name/i.test(invalidText), `unexpected validation error: ${invalidText}`);

    assert(session.stderr().includes("stdio ready"), "server did not log stdio readiness");
    assert(session.stderr().includes("source=stub"), "ready log should name the stub source");
  } finally {
    await session.close();
  }
}

async function exerciseEnv(): Promise<void> {
  const token = "super-secret-clickup-token";
  const session = await connect({
    LUNARCORE_ADAPTER: "memory",
    LUNARCORE_ACTOR_NAME: "Ada Lovelace",
    LUNARCORE_ACTOR_EMAIL: "iris@lunarcore.studio",
    LUNARCORE_ACTOR_ROLE: "Creative Director",
    LUNARCORE_WORKSPACE_NAME: "Night Shift",
    CLICKUP_API_TOKEN: token,
    CLICKUP_TEAM_ID: "team_123",
    GOOGLE_CLIENT_ID: "google-client",
  });
  try {
    const who = await call(session.client, "whoami");
    const actor = who.actor as { id: string; name: string; email: string };
    assert(actor.email === "iris@lunarcore.studio", "actor email override failed");
    assert(actor.id === "mem_iris", "matching member email should supply the actor id");
    assert(actor.name === "Ada Lovelace", "actor name should come from the environment");
    const context = await call(session.client, "workspace_context");
    const encoded = JSON.stringify(context);
    assert(!encoded.includes(token), "workspace_context leaked the ClickUp token");
    assert((context.workspace as { name: string }).name === "Night Shift", "workspace name override failed");
    const integrations = context.integrations as {
      clickup: { configured: boolean; present: { apiToken: boolean; teamId: boolean } };
      google: { configured: boolean; present: { clientId: boolean; clientSecret: boolean } };
    };
    assert(integrations.clickup.configured === true, "complete ClickUp env should count as configured");
    assert(integrations.clickup.present.apiToken === true, "token presence flag missing");
    assert(integrations.google.configured === false, "partial Google env must not count as configured");
    assert(integrations.google.present.clientId === true, "google client id presence missing");
    assert(integrations.google.present.clientSecret === false, "missing google secret should be false");
  } finally {
    await session.close();
  }
}

function runProcess(env: Record<string, string>): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...getDefaultEnvironment(), ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`process did not exit\nstdout=${stdout}\nstderr=${stderr}`));
    }, 5_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, stderr, stdout });
    });
    child.stdin.end();
  });
}

async function exerciseRefusals(): Promise<void> {
  for (const adapter of ["clickup", "google"] as const) {
    const result = await runProcess({ LUNARCORE_ADAPTER: adapter });
    assert(result.code !== 0, `${adapter} adapter should refuse to start`);
    assert(/not available yet/i.test(result.stderr), `${adapter} stderr was ${result.stderr}`);
    assert(!/stdio ready/.test(result.stderr), `${adapter} placeholder should not become ready`);
  }
  const unknown = await runProcess({ LUNARCORE_ADAPTER: "notion" });
  assert(unknown.code !== 0, "unknown adapter should fail");
  assert(/Unknown LUNARCORE_ADAPTER/.test(unknown.stderr), unknown.stderr);

  const clickup = createClickUpStudio();
  assert(clickup.source === "clickup", "clickup placeholder source");
  try {
    await clickup.listClients({});
    throw new Error("clickup placeholder should throw");
  } catch (error) {
    assert(error instanceof StudioError, "clickup error should be a StudioError");
    assert(error.code === "not_implemented", error.message);
    assert(/Planned mapping/.test(error.message), error.message);
  }
  const google = createGoogleStudio();
  assert(google.source === "google", "google placeholder source");
  try {
    await google.createDoc({ title: "x", body: "y" });
    throw new Error("google placeholder should throw");
  } catch (error) {
    assert(error instanceof StudioError, "google error should be a StudioError");
    assert(/Drive|Docs|documents/i.test(error.message), error.message);
  }

  let refused = false;
  try {
    createStudio({ LUNARCORE_ADAPTER: "clickup" });
  } catch (error) {
    refused = true;
    assert(error instanceof Error && /placeholder/.test(error.message), String(error));
  }
  assert(refused, "createStudio should refuse the clickup adapter");
}

function exerciseDotEnv(): void {
  const dir = mkdtempSync(path.join(tmpdir(), "lunarcore-env-"));
  const file = path.join(dir, ".env");
  const previous = process.env.LUNARCORE_WORKSPACE_NAME;
  const kept = process.env.LUNARCORE_ACTOR_NAME;
  const previousToken = process.env.CLICKUP_API_TOKEN;
  delete process.env.LUNARCORE_WORKSPACE_NAME;
  process.env.LUNARCORE_ACTOR_NAME = "Kept";
  try {
    writeFileSync(
      file,
      [
        "# comment",
        "export LUNARCORE_WORKSPACE_NAME=\"From File\"",
        "LUNARCORE_ACTOR_NAME=Other",
        "CLICKUP_API_TOKEN=secret",
        "",
      ].join("\n"),
    );
    loadDotEnv(file);
    assert(process.env.LUNARCORE_WORKSPACE_NAME === "From File", "dotenv did not load a quoted value");
    assert(process.env.LUNARCORE_ACTOR_NAME === "Kept", "dotenv overrode an existing variable");
    assert(process.env.CLICKUP_API_TOKEN === "secret", "dotenv missed an unquoted value");
  } finally {
    if (previous === undefined) delete process.env.LUNARCORE_WORKSPACE_NAME;
    else process.env.LUNARCORE_WORKSPACE_NAME = previous;
    if (kept === undefined) delete process.env.LUNARCORE_ACTOR_NAME;
    else process.env.LUNARCORE_ACTOR_NAME = kept;
    if (previousToken === undefined) delete process.env.CLICKUP_API_TOKEN;
    else process.env.CLICKUP_API_TOKEN = previousToken;
  }
}

await exerciseServer();
await exerciseEnv();
await exerciseRefusals();
exerciseDotEnv();
console.log(`smoke ok (${EXPECTED_TOOLS.length} tools)`);
