import { parseStudioConfig, type StudioConfig } from "../config/env.js";
import type { StudioOs } from "../types/studio.js";
import { createClickUpStudio } from "./clickup/clickup-studio.js";
import { createGoogleStudio } from "./google/google-studio.js";
import { MemoryStudio } from "./memory/memory-studio.js";

export const placeholderStudios = {
  clickup: createClickUpStudio,
  google: createGoogleStudio,
} as const;

/**
 * memory (default) is a working in-memory stub.
 * clickup and google construct their placeholders, then fail closed so a
 * missing implementation cannot be mistaken for live studio data.
 */
export function createStudio(env: NodeJS.ProcessEnv = process.env): StudioOs {
  const config = parseStudioConfig(env);
  if (config.adapter === "memory") return new MemoryStudio(config);
  return refusePlaceholder(config.adapter);
}

function refusePlaceholder(adapter: Exclude<StudioConfig["adapter"], "memory">): never {
  const placeholder = placeholderStudios[adapter]();
  const label = adapter === "clickup" ? "ClickUp" : "Google";
  throw new Error(
    `LUNARCORE_ADAPTER=${adapter} is not available yet (placeholder source=${placeholder.source}). ` +
      `The ${label} adapter is a typed placeholder. Unset LUNARCORE_ADAPTER or set it to memory to use the in-memory stub. ` +
      `Tool names stay the same when the live adapter replaces src/adapters/${adapter}.`,
  );
}
