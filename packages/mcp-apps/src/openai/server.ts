/**
 * ChatGPT helpers that wrap `@openai/mcp-extensions/server`.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  OpenAIExtensions,
  type OpenAIUiEntrypoint,
  type OpenAIUiResourceMetadata,
  type OpenAIUiToolMetadata,
} from "@openai/mcp-extensions/server";

/** Return the official OpenAI extensions surface for this MCP server. */
export function enableOpenAiExtensions(server: McpServer): OpenAIExtensions {
  return new OpenAIExtensions(server);
}

/** Build a `_meta` fragment with typed `"openai/ui"` tool metadata. */
export function openaiUiToolMeta(
  meta: OpenAIUiToolMetadata,
): { "openai/ui": OpenAIUiToolMetadata } {
  return { "openai/ui": meta };
}

/** Build a `_meta` fragment with typed `"openai/ui"` resource metadata. */
export function openaiUiResourceMeta(
  meta: OpenAIUiResourceMetadata,
): { "openai/ui": OpenAIUiResourceMetadata } {
  return { "openai/ui": meta };
}

export {
  OpenAIExtensions,
  type OpenAIUiEntrypoint,
  type OpenAIUiResourceMetadata,
  type OpenAIUiToolMetadata,
};
