import { z } from "zod";

import { defineTool, readOnly, createOnly, type StudioTool } from "./define.js";
import {
  bodyField,
  dateTimeField,
  dayField,
  docKindField,
  entityKindField,
  idField,
  limitField,
  nameField,
  queryField,
  textField,
} from "./schemas.js";

export const peopleTools: StudioTool[] = [
  defineTool({
    name: "member_list",
    title: "List members",
    description: "List studio members. Filter by active flag or text.",
    inputSchema: {
      active: z.boolean().optional().describe("When set, only active or only inactive members."),
      query: queryField.optional(),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.listMembers(args),
  }),
  defineTool({
    name: "member_resolve",
    title: "Resolve member",
    description: "Resolve members by name, email, or role. Exact email matches come first.",
    inputSchema: {
      query: queryField.describe("Name, email, or role fragment."),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.resolveMember(args),
  }),
  defineTool({
    name: "doc_search",
    title: "Search docs",
    description: "Search studio documents by title or body. Optionally scope to a client, project, or kind.",
    inputSchema: {
      query: queryField,
      clientId: idField.optional(),
      projectId: idField.optional(),
      kind: docKindField.optional(),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.searchDocs(args),
  }),
  defineTool({
    name: "doc_get",
    title: "Get doc",
    description: "Get one document by id.",
    inputSchema: { id: idField.describe("Document id.") },
    annotations: readOnly,
    handler: (args, studio) => studio.getDoc(args),
  }),
  defineTool({
    name: "doc_create",
    title: "Create doc",
    description: "Create a studio document. Kind defaults to note. A project must belong to the given client.",
    inputSchema: {
      title: nameField.describe("Document title."),
      body: bodyField,
      kind: docKindField.optional().describe("Defaults to note."),
      clientId: idField.optional(),
      projectId: idField.optional(),
    },
    annotations: createOnly,
    handler: (args, studio) => studio.createDoc(args),
  }),
  defineTool({
    name: "reminder_create",
    title: "Create reminder",
    description: "Create a reminder. relatedKind and relatedId must be passed together when linking a record.",
    inputSchema: {
      title: nameField,
      dueAt: dateTimeField,
      assigneeId: idField.optional().describe("Member id."),
      relatedKind: entityKindField.optional(),
      relatedId: idField.optional(),
      notes: textField.optional(),
    },
    annotations: createOnly,
    handler: (args, studio) => studio.createReminder(args),
  }),
  defineTool({
    name: "reminder_list",
    title: "List reminders",
    description: "List reminders, soonest due first.",
    inputSchema: {
      assigneeId: idField.optional(),
      query: queryField.optional(),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.listReminders(args),
  }),
  defineTool({
    name: "time_log",
    title: "Log time",
    description:
      "Log time for a member. Date defaults to today (UTC). When taskId is set, the entry is filed on that task's project. Maximum 1440 minutes.",
    inputSchema: {
      memberId: idField.describe("Member id."),
      minutes: z.number().int().positive().max(1440).describe("Minutes worked."),
      date: dayField.optional().describe("YYYY-MM-DD. Defaults to today UTC."),
      projectId: idField.optional(),
      taskId: idField.optional(),
      note: textField.optional(),
    },
    annotations: createOnly,
    handler: (args, studio) => studio.logTime(args),
  }),
  defineTool({
    name: "time_summary",
    title: "Time summary",
    description: "Sum logged minutes, optionally for one member, project, and inclusive date range.",
    inputSchema: {
      memberId: idField.optional(),
      projectId: idField.optional(),
      from: dayField.optional(),
      to: dayField.optional(),
    },
    annotations: readOnly,
    handler: (args, studio) => studio.timeSummary(args),
  }),
];
