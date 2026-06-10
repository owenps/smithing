# Stable Release Scope

Issue: [#26 Production readiness](https://github.com/owenps/fluidity/issues/26)

## Release promise

The first stable release is a macOS, local-first development workspace focused on reliable Project, Workspace, Terminal Tile, Tool Tile, Extension, and Settings flows.

Stable means these scoped flows are documented, data-safe, and smoke-tested. It does not mean every product-direction surface in `CONTEXT.md` is implemented.

## In scope

### Projects

- Register local Project roots and persist them in the Project Registry.
- Detect Git-backed Projects versus Non-Git Projects.
- Surface unavailable Registered Projects without deleting their roots.
- Project Disconnect removes Fluidity state and Fluidity-managed workspace roots, but never deletes the Project root or branches.

Deferred:

- Remote clone/import flows.
- Project search/indexing, issue tracker metadata, PR metadata, or per-project dashboards.
- Multi-root Projects.

### Workspaces

- Open and switch Workspaces through the app-wide Workspace Stack.
- Create Git-backed Workspaces as Fluidity-managed git worktrees with generated Workspace Branches.
- Preserve Workspace Tile State: tile kind, geometry, title, and Tool Tile resume metadata.
- Discard Git-backed Workspaces with dirty-workspace confirmation.
- Support Project Settings for files copied into new Workspaces and local Workspace Branch discard policy.
- Use a Home Workspace for Non-Git Projects.

Deferred:

- Arrangements and startup actions.
- Merge/rebase/push/PR workflows.
- Workspace Attention State and unread activity.
- Long-running Workspace runtime preservation across app restarts.

### Terminal Tiles

- PTY-backed shell sessions rooted at the Workspace root.
- Terminal input, resize, rendering, and close behavior.
- Packaged macOS terminal environment behavior documented in [Terminal Environment](terminal-environment.md).
- Persist the Terminal Tile, not live shell runtime state.

Deferred:

- Restored terminal scrollback or shell processes after app restart.
- Remote terminals, SSH management, or terminal profiles beyond scoped Settings.

### Tool Tiles

- Terminal-rendered Tool Tiles for external CLIs.
- Core Extension Pack Tool Tiles for supported agent CLIs.
- Availability checks before launch.
- Tool Resume Metadata for supported resume strategies.
- Unavailable state when a persisted Tool Tile no longer resolves.

Deferred:

- GUI embedding for external tools.
- Arbitrary background tool orchestration.
- Tool-specific deep integrations beyond launch/resume.

### Extensions

- Manifest-only v1 Extension Definitions in `fluidity.extension.json`.
- Global Extensions and Project Extensions discovery.
- Integration Tile Contributions as command-backed Tool Tiles.
- Manual Extension Reload.
- Extension Settings/diagnostics for loaded, skipped, and invalid definitions.
- Static icon keys and relative image icon paths.

Deferred:

- Executable Extension Modules.
- Active Extension Points: command handlers, schedules, lifecycle hooks, Workspace Composition, file actions, browser automation, voice/input providers.
- Extension marketplace, auto-update, file watching, or remote install flows.

### Settings

- App-level Settings View with Global and Project scopes.
- Persisted global Settings for debug layout, terminal font size, tile headers, deletion-positive stats, and tile picker visibility.
- Project Settings for Workspace file copy and Workspace Branch discard policy.
- Extensions settings/diagnostics surface.
- Application Reset with dirty-workspace confirmation.
- Keybinds are view-only.

Deferred:

- Editable Keybinds.
- Settings sync, accounts, secrets, themes, and per-Extension custom settings.

## Explicitly not stable-release scope

- Browser Tiles.
- Code editor Tiles.
- Git diff/review Tiles.
- Issue views.
- PR review/status surfaces.
- Arrangement authoring or reusable workspace templates.
- Active/executable Extension runtime.
- Non-macOS packaging.
