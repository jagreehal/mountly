import { createGenerativeView } from "mountly-mcp/json-render";
import { catalog } from "./catalog.js";
import { components } from "./registry.js";
import styles from "./styles.css";

/**
 * The whole generative MCP View in one call: reads the spec from the tool
 * result, renders it natively (resolving `$state` from `spec.state`), and
 * routes the `ask` action back to the agent via `App.sendMessage`.
 */
createGenerativeView({
  catalog,
  components,
  styles,
  shadow: true,
});
