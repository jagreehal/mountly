# Mountly

Mountly turns reusable interface code into portable, on-demand views, including views delivered through MCP Apps.

## Language

**View**:
An interactive interface delivered as an MCP Apps `ui://` resource and rendered by a host.
_Avoid_: Widget resource, UI component

**App artifact**:
The complete built representation of one View: its HTML, protocol resource metadata, and View runtime configuration.
_Avoid_: Sidecar, bundle

**App manifest**:
A versioned collection of one or more App artifacts produced by a build and consumed by development, registration, and verification.
_Avoid_: Plugin metadata, build output list

**App registration**:
The association of independently declared Views and tools on an MCP server through a resource URI.
_Avoid_: Widget registration, server creation

**Dev session**:
A local, sandboxed host session that renders an App artifact and may connect it to a real MCP server.
_Avoid_: Preview shim, demo host

**Conformance report**:
A deterministic set of diagnostics describing whether App artifacts, registrations, and protocol behavior satisfy Mountly and MCP Apps requirements.
_Avoid_: Validation result, test output
