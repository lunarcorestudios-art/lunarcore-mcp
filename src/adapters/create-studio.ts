import { parseStudioConfig } from "../config/env.js";
import type { StudioOs } from "../types/studio.js";
import { createClickUpStudio } from "./clickup/clickup-studio.js";
import { createGoogleStudio } from "./google/google-studio.js";
import { MemoryStudio } from "./memory/memory-studio.js";

export const placeholderStudios = {
  google: createGoogleStudio,
} as const;

/**
 * memory (default) is a working in-memory stub.
 * clickup serves the Client Work space when CLICKUP_API_TOKEN and CLICKUP_TEAM_ID are set.
 * google is still a typed placeholder and refuses to start.
 */
export function createStudio(env: NodeJS.ProcessEnv = process.env): StudioOs {
  const config = parseStudioConfig(env);
  if (config.adapter === "memory") return new MemoryStudio(config);
  if (config.adapter === "clickup") return createClickUpStudio(env);
  return refuseGoogle();
}

function refuseGoogle(): never {
  const placeholder = createGoogleStudio();
  throw new Error(
    `LUNARCORE_ADAPTER=google is not available yet (placeholder source=${placeholder.source}). ` +
      `The Google adapter is a typed placeholder. Unset LUNARCORE_ADAPTER or set it to memory to use the in-memory stub. ` +
      `Tool names stay the same when the live adapter replaces src/adapters/google.`,
  );
}
