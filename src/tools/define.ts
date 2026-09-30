import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z, type ZodRawShape } from "zod";

import { StudioError } from "../types/errors.js";
import type { DataSource } from "../types/entities.js";
import type { ToolEnvelope } from "../types/results.js";
import type { StudioOs } from "../types/studio.js";

export interface ToolHints {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface StudioTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  annotations?: ToolHints;
  handler: (args: Record<string, unknown>, studio: StudioOs) => Promise<unknown>;
}

export function defineTool<S extends ZodRawShape>(tool: {
  name: string;
  title: string;
  description: string;
  inputSchema: S;
  annotations?: ToolHints;
  handler: (args: z.infer<z.ZodObject<S>>, studio: StudioOs) => Promise<unknown>;
}): StudioTool {
  return tool as unknown as StudioTool;
}

export const readOnly = { readOnlyHint: true, openWorldHint: false } as const;
export const createOnly = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;
export const updateOnly = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export function registerStudioTools(server: McpServer, studio: StudioOs, tools: readonly StudioTool[]): void {
  const seen = new Set<string>();
  for (const tool of tools) {
    if (seen.has(tool.name)) throw new Error(`Duplicate MCP tool: ${tool.name}`);
    seen.add(tool.name);
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { openWorldHint: false, ...tool.annotations },
      },
      async (args) => {
        try {
          const data = await tool.handler(args as Record<string, unknown>, studio);
          return okResult(studio.source, data);
        } catch (error) {
          if (!(error instanceof StudioError)) {
            console.error(`[lunarcore-mcp] ${tool.name} failed`, error);
          }
          return errorResult(studio.source, error);
        }
      },
    );
  }
}

function okResult(source: DataSource, data: unknown): CallToolResult {
  const body: ToolEnvelope<unknown> = { ok: true, source, data };
  return {
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: asStructured(body),
  };
}

function errorResult(source: DataSource, error: unknown): CallToolResult {
  const known = error instanceof StudioError ? error : undefined;
  const body: ToolEnvelope<never> = {
    ok: false,
    source,
    error: {
      code: known?.code ?? "internal",
      message: known?.message ?? (error instanceof Error ? error.message : "Unexpected error"),
    },
  };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
    structuredContent: asStructured(body),
  };
}

function asStructured(body: ToolEnvelope<unknown>): { [key: string]: unknown } {
  return JSON.parse(JSON.stringify(body)) as { [key: string]: unknown };
}
