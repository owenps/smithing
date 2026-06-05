# Extension Discovery and Reload

Fluidity discovers v1 Extension Definitions from predictable directories and exposes their contributions through a scoped runtime contribution registry. Discovery is explicit enough for users and agents to inspect, while reload is manual so extension authoring does not unexpectedly mutate running work.

## Extension sources

Fluidity builds every effective Extension catalog from these sources:

1. **Core Extension Pack**: the always-present first-party Extension with Extension Identity `fluidity.core`.
2. **Global Extensions**: Extension Definitions under Fluidity's app data directory at `extensions/<extension-id>/fluidity.extension.json`.
3. **Project Extensions**: Extension Definitions under `.fluidity/extensions/<extension-id>/fluidity.extension.json` in a Project root.

The `<extension-id>` directory name must match the Extension Definition `id`. `fluidity.core` is reserved for the Core Extension Pack. Extension paths outside those roots, absolute icon paths, parent-directory traversal, and URLs remain unsupported in v1.

## Scope model

Global Extensions are available across all Projects and Workspaces in this Fluidity app installation. Project Extensions are available only to Workspaces that belong to the Project containing the `.fluidity/extensions` directory.

Fluidity should not globally load Project Extension contributions from every Registered Project. Instead, it keeps Project Extension snapshots keyed by Project id/root for Projects that have relevant Open Workspaces or are otherwise being resolved for the Current Workspace. The effective catalog for a Workspace is:

```text
Core Extension Pack + Global Extensions + Project Extensions for that Workspace's Project
```

The Tile picker, availability checks, launch resolution, and Tile rendering should all ask for the effective catalog for the relevant Workspace. This allows two Open Workspaces from different Projects to see different Project Extension contributions at the same time.

Within one effective catalog, Extension Identity must be unique and contribution identity is resolved by `extensionId + integrationId + integrationTileId`. Duplicate Extension identities or duplicate contribution identities in the same effective catalog are load diagnostics; v1 should skip the ambiguous duplicate contribution rather than silently overriding another contribution. Override semantics can be designed later if needed.

## Discovery lifecycle

Fluidity loads Extension Definitions into a runtime contribution registry:

- App startup loads the Core Extension Pack and Global Extensions.
- Opening or switching to a Workspace ensures that Project's Project Extension snapshot is loaded for that Workspace's effective catalog.
- The registry records provenance for each loaded Extension Definition: source kind, Extension Identity, manifest path, Project id/root when applicable, and validation or load diagnostics.
- Invalid Extension Definitions do not prevent Fluidity from starting or loading other Extensions. They produce diagnostics and contribute nothing.

Discovery reads the filesystem at these lifecycle points, but Fluidity does not watch extension files. After a user or agent edits an Extension Definition, they must run Extension Reload to replace the registry snapshots.

## Extension Reload Command

Extension Reload is a manual Command, tentatively `extensions.reload` with the title **Reload Extensions**. It has no default Keybind in v1 and should be reachable from the Command palette and native menu if present.

Running Extension Reload:

1. Re-reads Global Extensions from the app data `extensions` directory.
2. Re-reads Project Extensions only for Projects with relevant Open Workspaces, including the Current Workspace's Project.
3. Validates Extension Definitions and rebuilds contribution registry snapshots.
4. Publishes the updated effective catalogs to the frontend so Tile picker entries, availability state, and future launches/resumes use the new contributions.
5. Reports a concise success/failure summary with diagnostics for invalid or skipped Extension Definitions.

Extension Reload does not watch files, debounce file events, or automatically run after filesystem changes.

## Workspace Tile State and live runtimes

Extension Reload changes available contributions, not existing Workspace Tile State.

Persisted Tool Tiles keep their `extensionId`, `integrationId`, `integrationTileId`, geometry, title, and Tile Resume Metadata. Reload must not sanitize, remove, rewrite, or close those Tiles just because their contribution is no longer available.

Existing terminal-backed runtimes are left alone during Extension Reload:

- normal Terminal Tiles keep running;
- running terminal-rendered Tool Tiles keep running even if their contribution was removed or changed;
- changed commands affect only future launches/resumes after a Tile is closed, recreated, or otherwise needs resolution again.

This follows the rule that Workspace Tile State is durable structure while Terminal Session Runtime state is live runtime state.

## Unavailable Integration Tiles

When an existing Integration Tile can no longer resolve its contribution in the Workspace's effective catalog, Fluidity keeps the Tile and renders a simple unavailable/broken state instead of falling back to a generic Terminal Tile.

The message should include enough identity to help the user or an agent fix the Extension Definition, for example:

> Integration Tile unavailable. Fluidity could not find `example.my-agent:my-agent.cli` for this Workspace. Restore the Extension Definition or run Reload Extensions after fixing it.

Launching or resuming an unavailable Integration Tile should return a specific unresolved-contribution error that includes the same identity and provenance/diagnostic context when available.

## Implementation seams

The prototype should make these behavior boundaries explicit:

- Rust owns Extension Definition discovery, validation, registry snapshots, provenance, launch resolution, and Workspace-scoped catalog APIs.
- TypeScript receives effective catalog data for the Current Workspace and renders the Tile picker/unavailable states without duplicating discovery rules.
- Availability and launch requests include Workspace context so Project Extension scope is enforced in Rust.
- The Core Extension Pack is seeded into the same registry shape as Global Extensions and Project Extensions so future executable Extension modules can contribute through the same Extension Point model.
