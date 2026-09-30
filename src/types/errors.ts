export type StudioErrorCode = "not_found" | "invalid" | "not_implemented";

/** Domain error surfaced to MCP clients as a structured tool result. */
export class StudioError extends Error {
  readonly code: StudioErrorCode;

  constructor(code: StudioErrorCode, message: string) {
    super(message);
    this.name = "StudioError";
    this.code = code;
  }
}
