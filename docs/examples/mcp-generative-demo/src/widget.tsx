import { createGenerativeWidget } from "mountly-mcp/json-render";
import { catalog } from "./catalog.js";
import { components } from "./registry.js";
import styles from "./styles.css";

/**
 * The whole generative MCP widget in one call: reads the spec from the tool
 * result, renders it natively (resolving `$state` from `spec.state`), and
 * routes the `ask` action back to the agent via `App.sendMessage`. The manual
 * catalog→registry→renderer→state→action-bridge wiring now lives in
 * `mountly-mcp/json-render`.
 */
const widget = createGenerativeWidget({
  catalog,
  components,
  styles,
  shadow: true,
});

(globalThis as { __mountlyMcpWidget__?: unknown }).__mountlyMcpWidget__ = widget;
