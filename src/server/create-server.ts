import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { DataSource } from "../types/entities.js";
import type { StudioOs } from "../types/studio.js";
import { registerAllTools } from "../tools/index.js";

export const SERVER_NAME = "lunarcore-os";
export const SERVER_VERSION = "0.1.0";

function instructionsFor(source: DataSource): string {
  const shared = [
    "Lunarcore Studios OS. Tools are stable studio verbs for clients, projects, delivery, pipeline, people, docs, reminders, and time.",
    "Use whoami and workspace_context for the actor and which integrations are configured. Use search when the record kind is unclear.",
  ].join(" ");
  if (source === "clickup") {
    return [
      shared,
      "This process uses ClickUp. Clients are folders in the Client Work space, except names starting with _TEMPLATE.",
      "Projects are the lists in those folders. Default reads skip archived lists and names starting with _archive.",
      "Tasks are ClickUp tasks. Milestones are tasks tagged milestone. Successful payloads use source \"clickup\".",
      "Pipeline, docs, reminders, and time are not implemented on this adapter.",
    ].join(" ");
  }
  return [
    shared,
    "This process uses the in-memory stub: successful payloads use source \"stub\" and reset when the process exits.",
  ].join(" ");
}

export function createServer(studio: StudioOs): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      title: "Lunarcore Studios OS",
      description:
        studio.source === "clickup"
          ? "Studio operating system for Lunarcore. Delivery data comes from ClickUp."
          : "Studio operating system for Lunarcore. The memory adapter returns in-memory stub data.",
    },
    { instructions: instructionsFor(studio.source) },
  );
  registerAllTools(server, studio);
  return server;
}
