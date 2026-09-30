import { existsSync, readFileSync } from "node:fs";

import type { IntegrationPresence } from "../types/results.js";

export type AdapterName = "memory" | "clickup" | "google";

export interface StudioConfig {
  adapter: AdapterName;
  workspaceName: string;
  actor: {
    name: string;
    email: string;
    role: string;
  };
  integrations: IntegrationPresence;
}

function readValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function flag(value: string | undefined): boolean {
  return readValue(value) !== undefined;
}

/**
 * Load a local `.env` file without overriding variables the host already set.
 * MCP clients usually inject env themselves; this exists for `npm start`.
 */
export function loadDotEnv(path = ".env"): void {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const body = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function parseStudioConfig(env: NodeJS.ProcessEnv = process.env): StudioConfig {
  const requested = (readValue(env.LUNARCORE_ADAPTER) ?? "memory").toLowerCase();
  const adapter = requested === "stub" ? "memory" : requested;
  if (adapter !== "memory" && adapter !== "clickup" && adapter !== "google") {
    throw new Error(
      `Unknown LUNARCORE_ADAPTER=${requested}. Use memory (default), clickup, or google.`,
    );
  }

  const clickupToken = flag(env.CLICKUP_API_TOKEN);
  const clickupTeam = flag(env.CLICKUP_TEAM_ID);
  const googleClientId = flag(env.GOOGLE_CLIENT_ID);
  const googleSecret = flag(env.GOOGLE_CLIENT_SECRET);
  const googleRefresh = flag(env.GOOGLE_REFRESH_TOKEN);

  return {
    adapter,
    workspaceName: readValue(env.LUNARCORE_WORKSPACE_NAME) ?? "Lunarcore Studios",
    actor: {
      name: readValue(env.LUNARCORE_ACTOR_NAME) ?? "Lunarcore Operator",
      email: readValue(env.LUNARCORE_ACTOR_EMAIL) ?? "operator@lunarcore.studio",
      role: readValue(env.LUNARCORE_ACTOR_ROLE) ?? "producer",
    },
    integrations: {
      clickup: {
        configured: clickupToken && clickupTeam,
        present: { apiToken: clickupToken, teamId: clickupTeam },
      },
      google: {
        configured: googleClientId && googleSecret && googleRefresh,
        present: {
          clientId: googleClientId,
          clientSecret: googleSecret,
          refreshToken: googleRefresh,
        },
      },
    },
  };
}
