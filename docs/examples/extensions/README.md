# Example Fluidity Extensions

These examples are copyable Extension Definitions for v1 manifest-only Fluidity Extensions. They are intentionally useful Tool Tiles, not fake schema-only fixtures.

Older issue text may call these "User Extensions". Fluidity v1 docs call app-wide user-installed Extensions **Global Extensions**. Project-scoped Extensions are **Project Extensions**.

## What these examples demonstrate

- command-backed Integration Tile Contributions declared in `fluidity.extension.json`;
- `resume.strategy: "none"` with tools that manage their own state or do not need Fluidity resume metadata;
- `resume.strategy: "session-id-arg"` with a tool that can reconnect by a stable session name;
- Global Extension and Project Extension installation layouts;
- manual Extension Reload after edits;
- expected unavailable-tool behavior when `command.argv[0]` is not on `PATH`.

These examples do **not** replace Fluidity's curated built-in Tool Tiles. Claude, Codex, Gemini, OpenCode, Pi, and other curated defaults remain contributions from the `fluidity.core` Core Extension Pack. Example Extensions are documentation and authoring fixtures only.

## Examples

### `example.lazygit`

Adds a Lazygit Tool Tile.

- Useful as either a Global Extension or a Project Extension.
- Requires `lazygit` on `PATH`.
- Uses `resume.strategy: "none"` because Lazygit state comes from the Workspace's git state and its own config.

### `example.tmux-session`

Adds a tmux session Tool Tile.

- Useful as either a Global Extension or a Project Extension.
- Requires `tmux` on `PATH`.
- Uses `resume.strategy: "session-id-arg"` so Fluidity appends `-s <session-id>` to the declared argv.
- Launches as `tmux new-session -A -s <session-id>`, which attaches to the named session if it already exists or creates it otherwise.

### `example.project-dev-server`

Adds a Project Dev Server Tool Tile that runs `pnpm dev`.

- Best used as a Project Extension.
- Requires `pnpm` on `PATH` and a matching `dev` script in the Project.
- Use this as a template: replace `command.argv` with the Project's real development command, such as `npm run dev`, `cargo watch -x run`, or `docker compose up`.
- Uses `resume.strategy: "none"` because a dev server should be relaunched from the Workspace root rather than resumed by Fluidity metadata.

## Install as a Global Extension

Global Extensions are available across all Projects and Workspaces in this Fluidity app installation.

1. Find Fluidity's app data directory for your platform/build.
2. Copy the example directory into the app data `extensions` directory.
3. Keep the directory name equal to the Extension Definition `id`.

Example layout:

```text
<Fluidity app data>/
  extensions/
    example.lazygit/
      fluidity.extension.json
```

After copying or editing the Extension Definition, run **Reload Extensions** from Fluidity.

## Install as a Project Extension

Project Extensions are available only to Workspaces that belong to that Project.

Copy the example directory under the Project root:

```text
<project-root>/
  .fluidity/
    extensions/
      example.project-dev-server/
        fluidity.extension.json
```

Keep the directory name equal to the Extension Definition `id`. After copying or editing the Extension Definition, run **Reload Extensions** from Fluidity.

## Reload after edits

Fluidity does not watch Extension files in v1. After creating, copying, or editing any `fluidity.extension.json`, run **Reload Extensions**. Reload re-reads Extension Definitions and updates future Tile picker entries and launches. It does not delete persisted Workspace Tile State and does not kill already-running terminal sessions.

## Command argv rules

`command.argv` is passed as exact argv entries:

- Fluidity does not split a string like `"pnpm dev"` into two arguments.
- Fluidity does not run implicit shell interpolation.
- Fluidity does not expand environment variables inside individual argv entries.
- Tool processes inherit the normal process environment.

Use separate argv entries:

```json
"command": {
  "argv": ["pnpm", "dev"]
}
```

If a tool needs shell behavior, explicitly launch a shell:

```json
"command": {
  "argv": ["sh", "-lc", "my-tool \"$MY_ENV\""]
}
```

## Unavailable tools

A valid Extension Definition can still contribute an unavailable Tool Tile if the configured executable is not on `PATH`.

For example, if `example.lazygit` is installed but `lazygit` is not installed, Fluidity should keep loading the Extension Definition but mark the Lazygit Tool Tile unavailable or show diagnostics when launching. This is different from an invalid Extension Definition, which contributes nothing until fixed and reloaded.

When troubleshooting unavailable Tool Tiles, check:

- Is `command.argv[0]` installed and on `PATH` for Fluidity's process environment?
- Does the extension directory name match the Extension Definition `id`?
- Was **Reload Extensions** run after the latest edit?
- Is the Extension installed in the expected Global Extension or Project Extension location?
- For Project Extensions, is the current Workspace part of the Project containing `.fluidity/extensions`?
- Is the JSON valid and compliant with [`../../schemas/fluidity-extension.v1.schema.json`](../../schemas/fluidity-extension.v1.schema.json)?
