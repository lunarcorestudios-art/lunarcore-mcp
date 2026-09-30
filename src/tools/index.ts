import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { StudioOs } from "../types/studio.js";
import { clientTools } from "./clients.js";
import { deliveryTools } from "./delivery.js";
import { registerStudioTools, type StudioTool } from "./define.js";
import { osTools } from "./os.js";
import { peopleTools } from "./people.js";
import { pipelineTools } from "./pipeline.js";

export const allTools: readonly StudioTool[] = [
  ...clientTools,
  ...deliveryTools,
  ...pipelineTools,
  ...peopleTools,
  ...osTools,
];

export const TOOL_NAMES: readonly string[] = allTools.map((tool) => tool.name);

export function registerAllTools(server: McpServer, studio: StudioOs): readonly string[] {
  registerStudioTools(server, studio, allTools);
  return TOOL_NAMES;
}
