# Extensibility

Fluidity's extensibility direction is to make the application a customizable platform for agent-orchestrated development workflows while keeping Fluidity Core small and durable.

## Confirmed direction

- Fluidity distinguishes **Fluidity Core** from the always-present **Core Extension Pack**.
- Fluidity Core owns durable platform primitives; the Core Extension Pack should contribute first-party user-facing Tiles and workflows wherever practical.
- The Core Extension Pack uses the stable Extension identity `fluidity.core`.
- **Extensions** contribute capabilities through supported **Extension Points**.
- **Integrations** remain the product term for external tool/platform connections; an Integration may be built into Fluidity Core or contributed by an Extension.
- The first Extension Point is **Integration Tile Contribution**.
- v1 Extension Definitions contribute one or more Integrations through `contributes.integrations[]`; Integration Tiles are nested under their Integration.
- Prefer one Extension per external tool/platform unless the contributed capabilities are tightly related.
- v1 Integration Tile Contributions are command-backed Tool Tiles rendered through the Terminal Session Runtime.
- v1 Extension Definitions support built-in icon keys for first-party contributions and relative SVG/PNG icon paths for Global Extensions and Project Extensions, with a text fallback when icon loading fails.
- v1 Tool Tile commands are argv arrays with no implicit shell interpolation or argument-level environment variable expansion.
- Tool Tile processes inherit the normal process environment; tools that need environment variables should read them directly or explicitly invoke a shell.
- v1 Tool Tile resume behavior uses explicit strategies, starting with `none` and `session-id-arg` rather than arbitrary launch templates.
- Persisted Integration Tiles resolve by `extensionId + integrationId + integrationTileId`, not by Integration identity alone.
- v1 Extensions use an **Extension Definition** stored in `fluidity.extension.json` with a `schemaVersion` field; the v1 schema is documented in [Extension Definitions](extension-definitions.md).
- `fluidity.extension.json` is a forward-compatible declaration layer, not a permanent rejection of executable Extension modules.
- Fluidity should support both **Global Extensions** and **Project Extensions**.
- Global Extensions live under Fluidity's app data directory at `extensions/<extension-id>/fluidity.extension.json` and are available across all Projects and Workspaces in this Fluidity app installation.
- Project Extensions live under `.fluidity/extensions/<extension-id>/fluidity.extension.json` in the Project root and are available only for that Project's Workspaces.
- Project Extension contributions should be scoped to relevant Open Workspaces/Current Workspace rather than globally loaded from every Registered Project.
- **Extension Reload** changes available contributions, not existing Workspace Tile State.
- If an existing Integration Tile no longer resolves after reload, Fluidity keeps the Tile and shows a simple unavailable/broken message so the user or an agent can fix the Extension Definition.
- Running terminal sessions are not killed by Extension Reload; reload affects future launches/resumes.
- Extension Reload is a manual user action. Fluidity does not watch extension files or auto-reload them by default.
- Discovery, Project Extension scoping, and manual reload behavior are specified in [Extension Discovery and Reload](extension-discovery-and-reload.md).
- The first Fluidity Skill should focus on Extension authoring and be named `fluidity-extensions`; its requirements and draft outline are documented in [`fluidity-extensions` Skill Requirements](fluidity-extensions-skill.md).
- Fluidity should prompt users to install the Skill when they take Extension-related actions, showing the command `npx skills add owenps/fluidity-extensions` rather than running it automatically.

## Open research questions

- What contribution registry shape lets manifest-only Extensions later coexist with executable Extension modules?
- What permissions/trust model is required before executable Extension modules are supported?

## v1 research target

Prove that a user or agent can add a custom agent/tool Tile without changing Fluidity source code, restart-free if practical, using only an Extension Definition.
