/**
 * LLM-shaped CLI errors: a stable code plus the next command or file to open.
 * Skills and agents should key off the `mountly-mcp/…` code prefix.
 */

export const CLI_ERROR_CODES = {
  MISSING_VITE_PLUGIN: "mountly-mcp/missing-vite-plugin",
  NO_VITE_CONFIG: "mountly-mcp/no-vite-config",
  UNKNOWN_VIEW: "mountly-mcp/unknown-view",
  MULTI_VIEW_NEEDS_APP: "mountly-mcp/multi-view-needs-app",
  INVALID_UI_URI: "mountly-mcp/invalid-ui-uri",
  BAD_SERVER_EXPORT: "mountly-mcp/bad-server-export",
  NO_TOOL_FOR_VIEW: "mountly-mcp/no-tool-for-view",
  UNKNOWN_OPTION: "mountly-mcp/unknown-option",
  UNKNOWN_COMMAND: "mountly-mcp/unknown-command",
  TARGET_EXISTS: "mountly-mcp/target-exists",
  MISSING_TEMPLATE: "mountly-mcp/missing-template",
  DOCTOR_FAILED: "mountly-mcp/doctor-failed",
} as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

export class MountlyMcpCliError extends Error {
  readonly code: CliErrorCode;
  readonly next: string;

  constructor(code: CliErrorCode, message: string, next: string) {
    super(`${code}: ${message}\n  Next: ${next}`);
    this.name = "MountlyMcpCliError";
    this.code = code;
    this.next = next;
  }
}

export function cliError(code: CliErrorCode, message: string, next: string): MountlyMcpCliError {
  return new MountlyMcpCliError(code, message, next);
}
