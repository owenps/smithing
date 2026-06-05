# Extension Definitions

Fluidity v1 Extensions are manifest-only packages described by a `fluidity.extension.json` Extension Definition. The v1 schema lives at [`docs/schemas/fluidity-extension.v1.schema.json`](schemas/fluidity-extension.v1.schema.json). Copyable examples live under [`docs/examples/extensions/`](examples/extensions/).

## v1 shape

A v1 Extension Definition includes:

- `schemaVersion`: numeric schema version, currently `1`.
- `id`: stable Extension identity, such as `fluidity.core` or `example.my-agent`.
- `title`: user-facing Extension title.
- `contributes.integrations[]`: Integrations contributed by the Extension.
- `contributes.integrations[].tiles[]`: Integration Tile Contributions nested under the owning Integration.

v1 Integration Tile Contributions are command-backed Tool Tiles. Integration ids are unique within an Extension, and Integration Tile ids are unique within their Integration. Their `command.argv` array is passed as argv entries. Fluidity does not add implicit shell interpolation, does not split strings, and does not perform argument-level environment variable expansion. Tool processes inherit the normal process environment; tools that need shell behavior should explicitly launch a shell in `argv`.

## Resume strategies

`resume.strategy` controls Tile Resume Metadata behavior:

- `none`: launch the declared argv exactly and do not assign resume metadata.
- `session-id-arg`: assign a stable Fluidity session identifier and append it as two argv entries: the configured `arg`, followed by the session identifier.

## Icons

Extensions, Integrations, and Integration Tiles may declare an `icon`.

- `{ "key": "pi" }` references a first-party Fluidity icon key.
- `{ "path": "icons/my-tool.svg" }` references a relative SVG or PNG file from the directory containing `fluidity.extension.json`.

Absolute paths, URLs, and parent-directory traversal are not part of v1. If an icon is omitted or cannot be loaded, Fluidity falls back to a text icon derived from the nearest Integration Tile, Integration, or Extension title.

## Minimal valid example

```json
{
  "$schema": "https://raw.githubusercontent.com/owenps/fluidity/main/docs/schemas/fluidity-extension.v1.schema.json",
  "schemaVersion": 1,
  "id": "example.my-agent",
  "title": "My Agent",
  "contributes": {
    "integrations": [
      {
        "id": "my-agent",
        "title": "My Agent",
        "icon": { "path": "icons/my-agent.svg" },
        "tiles": [
          {
            "id": "cli",
            "kind": "tool",
            "title": "My Agent",
            "command": {
              "argv": ["my-agent"]
            },
            "resume": {
              "strategy": "session-id-arg",
              "arg": "--session-id"
            }
          }
        ]
      }
    ]
  }
}
```
