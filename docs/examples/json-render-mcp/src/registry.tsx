import { defineComponents } from "mountly-mcp/json-render";
import { catalog } from "./catalog.js";

/**
 * Native React implementations for every component in the catalog. Typed
 * against it, so `element.props` infers — adding a component here that the
 * catalog does not declare is a type error, and vice versa.
 *
 * Styles are inline so the bundle stays self-contained: the MCP host serves
 * this page inside a sandboxed iframe with no network access to a stylesheet.
 */
export const components = defineComponents(catalog, {
  Stack: ({ element, children }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: element.props.gap ?? 16 }}>
      {children}
    </div>
  ),
  Row: ({ element, children }) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: element.props.gap ?? 16 }}>
      {children}
    </div>
  ),
  Card: ({ element, children }) => (
    <section
      style={{
        flex: "1 1 180px",
        padding: 16,
        borderRadius: 12,
        border: "1px solid #e2e4e9",
        background: "#fff",
      }}
    >
      {element.props.title ? (
        <h3 style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>{element.props.title}</h3>
      ) : null}
      {children}
    </section>
  ),
  Heading: ({ element }) => (
    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>{element.props.text}</h2>
  ),
  Text: ({ element }) => (
    <p style={{ margin: 0, color: element.props.muted ? "#6b7280" : "#111827" }}>
      {element.props.text}
    </p>
  ),
  Stat: ({ element }) => (
    <div>
      <div style={{ fontSize: 13, color: "#6b7280" }}>{element.props.label}</div>
      <div style={{ fontSize: 26, fontWeight: 650 }}>{element.props.value}</div>
      {element.props.delta ? (
        <div style={{ fontSize: 13, color: "#15803d" }}>{element.props.delta}</div>
      ) : null}
    </div>
  ),
});
