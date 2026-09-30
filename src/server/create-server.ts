import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { StudioOs } from "../types/studio.js";
import { registerAllTools } from "../tools/index.js";

export const SERVER_NAME = "lunarcore-os";
export const SERVER_VERSION = "0.1.0";

const INSTRUCTIONS = [
  "Lunarcore Studios OS. Tools are stable studio verbs for clients, projects, delivery, pipeline, people, docs, reminders, and time.",
  "v1 is an in-memory stub: every successful payload has source \"stub\" and resets when the process exits.",
  "ClickUp and Google adapters will honor the same tool names. Do not invent ClickUp or Google calls; use these tools.",
  "Use whoami and workspace_context for the actor and which integrations are configured. Use search when the record kind is unclear.",
].join(" ");

export function createServer(studio: StudioOs): McpServer {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      title: "Lunarcore Studios OS",
      description: "Studio operating system for Lunarcore. v1 returns in-memory stub data.",
    },
    { instructions: INSTRUCTIONS },
  );
  registerAllTools(server, studio);
  return server;
}
