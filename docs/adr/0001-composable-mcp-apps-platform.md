# ADR 0001: Compose MCP Apps into application-owned servers

- Status: Accepted
- Date: 2026-08-17

## Context

Mountly began with a convenient one-View/one-tool server wrapper. That path is
useful for examples, but production applications already own authentication,
transport, prompts, ordinary tools, lifecycle, and deployment. Making Mountly
own those concerns would widen the platform while weakening composition.

Build, development, server registration, and verification also need the same
identity and file contract. Per-View metadata files alone do not represent a
multi-View application.

## Decision

The production seam is `registerMcpApps(existingServer, { views, tools })`, and
it must run before the server connects. Views and tools are declared
independently and linked by the View's `ui://` resource URI. Mountly registers
only MCP Apps resources, linked tools, capability negotiation, and the
text-only downgrade for clients without the UI extension.

The canonical build contract is the versioned App manifest. A single
`mountlyMcpWidget({ apps: [...] })` declaration builds each View in an isolated
Vite environment and emits that manifest. Development selects a View by its
developer key; protocol registration uses its URI. Both identities are unique.

Conformance is a deterministic offline library shared by the public testing
API and CLI. Errors fail verification. Warnings fail only in strict mode.

The development host uses the official published `AppBridge`. Mountly retains
only the host UI, real-server routing, and cross-origin sandbox proxy.

## Consequences

- Applications retain production ownership and can use any MCP transport or
  authentication architecture.
- Build, dev, registration, and CI share one artifact model.
- Multiple tools can reference one View, and app-only tools stay explicit.
- `createMcpAppServer`, `serveStdio`, single-View Vite configuration, and
  per-View metadata remain compatibility adapters rather than the core model.
- The official MCP Apps SDK remains the protocol authority; Mountly does not
  maintain a second handwritten host implementation.
