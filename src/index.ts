#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createStudio } from "./adapters/create-studio.js";
import { loadDotEnv } from "./config/env.js";
import { createServer } from "./server/create-server.js";

loadDotEnv();

let studio;
try {
  studio = createStudio(process.env);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[lunarcore-mcp] ${message}`);
  process.exit(1);
}

const server = createServer(studio);
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[lunarcore-mcp] stdio ready (source=${studio.source})`);
