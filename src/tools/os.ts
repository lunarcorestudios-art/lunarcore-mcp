import { z } from "zod";

import { defineTool, readOnly, updateOnly, type StudioTool } from "./define.js";
import { entityKindField, idField, limitField, nameField, queryField } from "./schemas.js";

export const osTools: StudioTool[] = [
  defineTool({
    name: "search",
    title: "Search studio",
    description:
      "Search across clients, projects, milestones, tasks, leads, proposals, members, docs, reminders, and time entries.",
    inputSchema: {
      query: queryField,
      kinds: z.array(entityKindField).max(10).optional().describe("Limit the search to these record kinds."),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.search(args),
  }),
  defineTool({
    name: "whoami",
    title: "Who am I",
    description: "Return the studio actor this server is acting as.",
    inputSchema: {},
    annotations: readOnly,
    handler: (_args, studio) => studio.whoami(),
  }),
  defineTool({
    name: "workspace_context",
    title: "Workspace context",
    description:
      "Return workspace name, record counts, the active adapter, and whether ClickUp or Google credentials are present. Secrets are not returned.",
    inputSchema: {},
    annotations: readOnly,
    handler: (_args, studio) => studio.workspaceContext(),
  }),
  defineTool({
    name: "link_entities",
    title: "Link entities",
    description:
      "Link two existing records. Repeating the same from, to, and relation returns the existing link.",
    inputSchema: {
      fromKind: entityKindField,
      fromId: idField,
      toKind: entityKindField,
      toId: idField,
      relation: nameField.describe("Short relation label, such as brief_for or depends_on."),
    },
    annotations: updateOnly,
    handler: (args, studio) => studio.linkEntities(args),
  }),
];
