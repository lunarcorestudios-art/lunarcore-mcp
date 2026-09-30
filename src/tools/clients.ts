import { defineTool, readOnly, createOnly, updateOnly, type StudioTool } from "./define.js";
import {
  clientStatusField,
  contactField,
  idField,
  limitField,
  nameField,
  queryField,
  textField,
} from "./schemas.js";

export const clientTools: StudioTool[] = [
  defineTool({
    name: "client_list",
    title: "List clients",
    description:
      "List studio clients. Optionally filter by status or a text query across name, industry, notes, and primary contact.",
    inputSchema: {
      status: clientStatusField.optional().describe("Filter by client status."),
      query: queryField.optional(),
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.listClients(args),
  }),
  defineTool({
    name: "client_get",
    title: "Get client",
    description: "Get one client by id.",
    inputSchema: { id: idField.describe("Client id.") },
    annotations: readOnly,
    handler: (args, studio) => studio.getClient(args),
  }),
  defineTool({
    name: "client_create",
    title: "Create client",
    description: "Create a client. Status defaults to active.",
    inputSchema: {
      name: nameField.describe("Client name."),
      status: clientStatusField.optional().describe("Defaults to active."),
      industry: nameField.optional().describe("Industry or sector."),
      primaryContact: contactField,
      notes: textField.optional().describe("Internal notes."),
    },
    annotations: createOnly,
    handler: (args, studio) => studio.createClient(args),
  }),
  defineTool({
    name: "client_update",
    title: "Update client",
    description: "Update a client. Omitted fields stay unchanged.",
    inputSchema: {
      id: idField.describe("Client id."),
      name: nameField.optional().describe("Client name."),
      status: clientStatusField.optional(),
      industry: nameField.optional(),
      primaryContact: contactField,
      notes: textField.optional(),
    },
    annotations: updateOnly,
    handler: (args, studio) => studio.updateClient(args),
  }),
  defineTool({
    name: "client_search",
    title: "Search clients",
    description: "Search clients by name, industry, notes, or primary contact.",
    inputSchema: {
      query: queryField,
      limit: limitField,
    },
    annotations: readOnly,
    handler: (args, studio) => studio.searchClients(args),
  }),
];
