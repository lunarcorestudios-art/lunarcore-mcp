import { createPlaceholderStudio } from "../placeholder.js";
import type { StudioOs } from "../../types/studio.js";
import { CLICKUP_MAPPING } from "./mapping.js";

/**
 * Placeholder ClickUp adapter. Constructing it does not call the network.
 * createStudio refuses to serve this until the live client replaces the placeholder.
 */
export function createClickUpStudio(): StudioOs {
  return createPlaceholderStudio("clickup", CLICKUP_MAPPING);
}
