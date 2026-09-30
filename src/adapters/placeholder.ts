import { StudioError } from "../types/errors.js";
import type { DataSource } from "../types/entities.js";
import type { StudioMethod, StudioOs } from "../types/studio.js";

/**
 * Builds a StudioOs whose every method fails closed with the planned mapping.
 * Real ClickUp and Google adapters replace this factory; tool names stay put.
 */
export function createPlaceholderStudio(
  source: Exclude<DataSource, "stub">,
  mapping: Record<StudioMethod, string>,
): StudioOs {
  const studio: Record<string, unknown> = { source };
  for (const method of Object.keys(mapping) as StudioMethod[]) {
    const planned = mapping[method];
    studio[method] = async () => {
      throw new StudioError(
        "not_implemented",
        `${source}.${method} is not implemented. Planned mapping: ${planned}`,
      );
    };
  }
  return studio as unknown as StudioOs;
}
