# `fluidity-extensions` Skill Requirements

The `fluidity-extensions` Skill should teach coding agents how to author, test, reload, and troubleshoot Fluidity v1 Extensions. It is a Fluidity Extension authoring skill, not a general Fluidity product usage guide.

## Install prompt

Fluidity docs and UI may prompt users to install the Skill by showing this command:

```sh
npx skills add owenps/fluidity-extensions
```

Fluidity must not run this command automatically. The user or their agent chooses whether to install it.

## Scope

The Skill should cover:

- creating manifest-only v1 Extension Definitions;
- choosing Global Extension vs Project Extension placement;
- validating `fluidity.extension.json` against the v1 schema;
- adding command-backed Integration Tile Contributions;
- running Extension Reload after edits;
- diagnosing missing commands, invalid definitions, duplicate identities, and unavailable/broken Tiles.

The Skill should not cover general Fluidity usage such as normal coding workflows, workspace management, git operations, terminal usage, PR review, Settings navigation outside extension diagnostics, or future executable Extension modules except to state that v1 is manifest-only.

## Required terminology

The Skill should use Fluidity's domain language consistently:

- **Extension**: a user- or Fluidity-provided package that contributes capabilities through supported Extension Points.
- **Global Extension**: an Extension installed for this Fluidity app installation and available across all Projects and Workspaces. Older issue text may call this a "User Extension"; the Skill should translate that wording to Global Extension rather than using User Extension as the primary term.
- **Project Extension**: an Extension available only for Workspaces belonging to one Project.
- **Extension Definition**: the static `fluidity.extension.json` file that declares Extension identity and contributions.
- **Extension Identity**: the stable `id` used to distinguish an Extension and resolve its contributions across reloads and app updates.
- **Integration**: a product-level connection to an external tool or platform. In v1, an Extension contributes Integrations under `contributes.integrations[]`.
- **Integration Tile**: a Tile provided by an Integration. In v1, contributed Integration Tiles are command-backed Tool Tiles.
- **Extension Reload**: the manual command that re-reads Extension Definitions and rebuilds available contributions without deleting Workspace Tile State or killing running terminal sessions.

## Extension locations

The Skill should teach both supported v1 locations:

```text
# Global Extension, available across all Projects and Workspaces in this Fluidity app installation
<Fluidity app data>/extensions/<extension-id>/fluidity.extension.json

# Project Extension, available only to that Project's Workspaces
<project-root>/.fluidity/extensions/<extension-id>/fluidity.extension.json
```

Requirements:

- `<extension-id>` directory name should match the Extension Definition `id`.
- `fluidity.core` is reserved for the Core Extension Pack.
- Project Extensions are scoped to the Project that contains `.fluidity/extensions`; they are not globally loaded from every registered Project.
- After creating or editing either location, run Extension Reload. Fluidity does not watch Extension files automatically.

## v1 Extension Definition schema guidance

The Skill should instruct agents to use `docs/schemas/fluidity-extension.v1.schema.json` as the source of truth. It should summarize these required fields:

- `schemaVersion`: must be numeric `1`.
- `id`: stable lower-case dotted/dashed Extension Identity, for example `example.my-agent`.
- `title`: user-facing Extension title.
- `contributes.integrations[]`: one or more Integration contributions.
- `contributes.integrations[].id` and `.title`.
- `contributes.integrations[].tiles[]`: one or more Integration Tile Contributions.
- Tile `id`, `kind: "tool"`, `title`, and `command.argv`.

Optional fields the Skill should mention:

- `description` on Extension, Integration, and Tile objects.
- `defaultVisible` on Tiles.
- `icon` using either first-party keys (`claude`, `codex`, `gemini`, `opencode`, `pi`) or relative SVG/PNG paths.
- `resume` with `strategy: "none"` or `strategy: "session-id-arg"` plus `arg`.

Command rules:

- `command.argv` is passed as argv entries.
- Fluidity does not split strings, run implicit shell interpolation, or expand environment variables inside individual argv entries.
- Tools inherit the normal process environment.
- If shell behavior is required, explicitly launch a shell, for example `"argv": ["sh", "-lc", "my-tool \"$MY_ENV\""]`.

## Examples the Skill should include

### Minimal command-backed Tool Tile

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
        "tiles": [
          {
            "id": "cli",
            "kind": "tool",
            "title": "My Agent",
            "defaultVisible": true,
            "command": {
              "argv": ["my-agent"]
            },
            "resume": {
              "strategy": "none"
            }
          }
        ]
      }
    ]
  }
}
```

### Tile with session resume argument and relative icon

```json
{
  "schemaVersion": 1,
  "id": "example.review-agent",
  "title": "Review Agent",
  "icon": { "path": "icons/review-agent.svg" },
  "contributes": {
    "integrations": [
      {
        "id": "review-agent",
        "title": "Review Agent",
        "tiles": [
          {
            "id": "cli",
            "kind": "tool",
            "title": "Review Agent",
            "icon": { "path": "icons/review-agent.svg" },
            "command": {
              "argv": ["review-agent", "--workspace", "."]
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

## Version drift and update guidance

The Skill can update independently from Fluidity, and users may have an old Skill, an old Fluidity build, or both. Keep the Skill light enough that stale copies still send agents to the authoritative docs rather than relying on bundled schema prose or bundled scripts.

The Skill should begin Extension authoring by checking the current Fluidity Extension docs and schema when network or repository access is available. The docs should remain the source of truth for the current schema, examples, validation commands, and troubleshooting steps.

The Skill should prompt, but not execute, updates:

- If the user appears to have an old Skill or asks for unsupported Extension behavior, show `npx skills add owenps/fluidity-extensions` and explain that it updates/reinstalls the authoring Skill.
- If Fluidity diagnostics report an unsupported `schemaVersion`, unsupported fields, or a feature the running app does not know about, ask the user to update Fluidity or downgrade the Extension Definition to the schema supported by their installed Fluidity version.
- If docs and local Fluidity behavior disagree, treat the running Fluidity diagnostics as authoritative for what this installation can load, and treat the docs as guidance for how to update.

Deterministic helpers should either live in Fluidity itself or be referenced from the docs with clear commands. Avoid making the Skill depend on many bundled scripts that can drift from the app. If scripts are bundled later, the Skill should still prefer current docs or app-provided validation when available.

## Authoring workflow the Skill should teach

1. Decide whether the Extension is Global-scoped or Project-scoped.
2. Choose a stable Extension Identity and create the matching directory.
3. Write `fluidity.extension.json` using the v1 schema.
4. Ensure the executable in `command.argv[0]` is installed and discoverable in Fluidity's process environment, or use an explicit shell command if needed.
5. Validate the JSON and schema before asking the user to reload.
6. Ask the user to run Extension Reload; do not assume file watching.
7. Confirm the Tile appears in the Tile picker for the expected Workspace scope.
8. Launch the Tile and verify command, resume behavior, icon fallback, and diagnostics.

## Troubleshooting requirements

The Skill should include a troubleshooting section for unavailable or broken Tiles.

An unavailable Tile means Fluidity preserved Workspace Tile State but could not resolve the Tile's contribution by:

```text
extensionId + integrationId + integrationTileId
```

The Skill should guide agents to check:

- Does the Extension Definition still exist in the correct Global Extension or Project Extension location?
- Does the directory name match the Extension Definition `id`?
- Was Extension Reload run after the latest edits?
- Is the current Workspace in the Project that owns the Project Extension?
- Did `extensionId`, `integrationId`, or `integrationTileId` change? If yes, existing persisted Tiles still point at the old identity.
- Is the JSON valid and schema-compliant?
- Are there duplicate Extension identities or duplicate contribution identities in the effective catalog?
- Is `command.argv[0]` installed and available? Missing executables should appear as unavailable availability diagnostics, not as missing Tile definitions.
- Are icon paths relative SVG/PNG files without absolute paths, URLs, or parent-directory traversal?

The Skill should tell agents not to "fix" an unavailable Tile by converting it to a generic Terminal Tile or deleting Workspace Tile State unless the user explicitly asks. The preferred fix is to restore or correct the Extension Definition and run Extension Reload.

## Proposed `SKILL.md` outline

```markdown
---
name: fluidity-extensions
description: Use this whenever the user wants to create, edit, test, reload, install, or troubleshoot Fluidity Extensions or fluidity.extension.json files. Focus on Extension authoring: Global Extensions, Project Extensions, v1 Extension Definition schema, Integration Tile Contributions, Extension Reload, and unavailable/broken Tile diagnostics. Do not use for general Fluidity app usage.
---

# Fluidity Extensions

## When to use this skill
## Fluidity Extension authoring only
## Key terminology
## Choose Global Extension or Project Extension
## Write a v1 Extension Definition
## Examples
## Check current docs and version compatibility
## Validate and test
## Reload Extensions
## Troubleshoot unavailable/broken Tiles
## What not to do
```
