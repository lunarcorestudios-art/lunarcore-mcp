import { createPlaceholderStudio } from "../placeholder.js";
import type { StudioOs } from "../../types/studio.js";
import { GOOGLE_MAPPING } from "./mapping.js";

/**
 * Placeholder Google adapter. Constructing it does not call the network.
 * createStudio refuses to serve this until Docs, Drive, and Calendar are wired.
 */
export function createGoogleStudio(): StudioOs {
  return createPlaceholderStudio("google", GOOGLE_MAPPING);
}
