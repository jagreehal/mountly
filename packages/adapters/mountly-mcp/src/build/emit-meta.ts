import { MCP_APPS_MIME, MCP_APPS_PROTOCOL_VERSION } from "../schema.js";
import type {
  DisplayMode,
  McpCsp,
  McpResourceDeclaration,
  McpResourcePermissions,
} from "../types.js";

export interface EmitMetaInput {
  uri: string;
  name: string;
  description?: string;
  awaitToolResult?: boolean;
  displayModes?: ReadonlyArray<DisplayMode>;
  csp?: McpCsp;
  /** Sandbox permissions requested by the view (camera/microphone/geolocation/clipboardWrite). */
  permissions?: McpResourcePermissions;
  /** Dedicated sandbox origin requested by the view (host-dependent format). */
  domain?: string;
  /** Whether the view requests the host to show a visible border + background. */
  prefersBorder?: boolean;
}

function assertUiUri(uri: string): void {
  if (!uri.startsWith("ui://")) {
    throw new Error(`mountly-mcp: UI resource uri must use the 'ui://' scheme (received '${uri}')`);
  }
}

export function emitMeta(input: EmitMetaInput): McpResourceDeclaration {
  assertUiUri(input.uri);

  const ui: McpResourceDeclaration["_meta"]["ui"] = {};
  if (input.csp) ui.csp = input.csp;
  if (input.permissions) ui.permissions = input.permissions;
  if (input.domain !== undefined) ui.domain = input.domain;
  if (input.prefersBorder !== undefined) ui.prefersBorder = input.prefersBorder;

  const decl: McpResourceDeclaration = {
    protocolVersion: MCP_APPS_PROTOCOL_VERSION,
    uri: input.uri,
    name: input.name,
    mimeType: MCP_APPS_MIME,
    awaitToolResult: input.awaitToolResult ?? true,
    displayModes: input.displayModes ?? ["inline"],
    _meta: { ui },
  };
  if (input.description !== undefined) decl.description = input.description;
  return decl;
}
