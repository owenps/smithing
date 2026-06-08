# Settings View

The Settings View is a full-page app-level surface for changing Settings and Project Settings. It is not a Workspace Tile and is not persisted in Workspace Tile State.

## Layout

The Settings View uses two top-level scopes:

- **Global**: app-wide Settings.
- **Project**: Project Settings for one selected Registered Project.

Each scope uses a two-panel layout:

- Left panel: categories for the current scope.
- Right panel: details for the selected category.

The Project scope includes a Project selector above the category/details panels. The selector lists Registered Projects by Project name in alphabetical order. If there are no Registered Projects, the selector shows an empty state. Settings does not include Add Project.

Opening Settings defaults to Global → General unless a scope/category was selected earlier in the same app session. The selected scope/category and Project selector are not persisted across app restarts. Opening Settings while it is already open is idempotent: it focuses Settings rather than closing it.

## Settings Categories

The Global Settings Categories are:

1. General
2. Appearance
3. Tiles
4. Extensions
5. Keybinds

### General

General contains Debug mode and the global Danger Zone for Application Reset.

Application Reset returns Fluidity to its unregistered starting state: Settings return to built-in defaults, Registered Projects and their Project Settings are removed, Open Workspaces and the Workspace Stack are cleared, and Fluidity-managed workspace roots are removed subject to dirty-workspace confirmation.

### Appearance

Appearance contains visual presentation Settings:

- Terminal font size
- Deletion-positive stats

### Tiles

Tiles contains Tile-related Settings:

- Tile headers
- Tile picker configuration

### Keybinds

Keybinds is view-only for the foundation. Editing Keybinds is deferred because it requires conflict handling, persistence, and native menu accelerator coordination.

## Keyboard model

The Settings View owns keyboard input while open. Workspace and Tile shortcuts do not fire behind it.

Navigation supports both arrow keys and `h/j/k/l`:

- `Tab`: switch between Global and Project scopes.
- Left panel focused:
  - `j/k`: move selection through categories for the current scope; the right panel updates immediately.
  - In Project scope, `k`/up from the first category focuses the Project selector; native select arrow keys choose the Project.
  - `l` or `Enter`: move focus into the right panel.
- Right panel focused:
  - `j/k`: move between controls and actions.
  - `h`: return focus to the left panel.
  - `l` or right arrow: adjust or open the focused control when applicable.
  - `Enter`: activate or toggle the focused control.
- `Esc`: exits an active text-input editing mode first. If not editing, it closes Settings.

The UI distinguishes selected destination from focused panel/control. When the right panel is focused, the selected left-panel row remains visibly selected but less prominent than active focus.

## Persistence

Settings and Project Settings are persisted in Rust-owned app-state JSON. Existing frontend `localStorage` Settings do not need migration.

Settings and Project Settings save immediately when changed. Project Settings changes affect future actions only.

## Project Settings

The Project scope categories are:

1. Overview: Project name, root, kind, root availability, and Project Danger Zone.
2. Workspaces: Project Settings that affect Workspace behavior.
3. Search: Project Search include and exclude paths.

Unavailable Registered Projects remain visible in the Project selector so they can be inspected or disconnected.

Disconnecting a Project from the Overview Danger Zone removes that Registered Project, closes its Open Workspaces, and removes Fluidity-managed workspace roots without deleting the Project root or local or remote branches. After disconnecting the selected Project, Settings selects the next Project alphabetically if one exists; otherwise it returns to Global → General.

## Git-backed Project Settings

### Files copied into new Workspaces

User-facing label: **Files copied into new Workspaces**

Description: **One Project-root-relative file per line. New git-backed Workspaces copy these files before opening, preserving relative paths.**

Default: empty.

Each entry is a file path relative to the Project root. When creating a new Git-backed Workspace, Fluidity copies each configured file from the Project root into the Workspace root after `git worktree add` and before the Workspace is opened. Relative paths and file contents are preserved, so `.env` copied from the Project root lands at `.env` in the Workspace, and `config/local.json` lands at `config/local.json`. The copy step can include files untracked by git or ignored by git.

Invalid paths, missing files, directories, unreadable files, or copy failures do not silently fail. Fluidity completes Workspace creation when possible and reports Workspace creation warnings naming the skipped file and reason. If no files are configured, Workspace creation behaves as before.

### Workspace Branch Discard Policy

User-facing label: **Delete local branch when discarding workspace**

Description: **When enabled, discarding a git-backed Workspace also deletes its local Workspace Branch when git says it is safe. Remote branches are never deleted automatically.**

Default: off.

When enabled, explicit Workspace discard attempts to delete the local Workspace Branch after removing the Workspace/worktree. Fluidity uses safe branch deletion only (`git branch -d`), never force deletion (`-D`), and never deletes remote branches. If git refuses because the branch is not safe to delete, Workspace discard still succeeds and Fluidity shows a warning that the branch was kept. If the branch is already gone, no warning is needed.

Branch deletion is skipped when the Project root is unavailable because Fluidity cannot safely ask git to delete the branch from the Project. Project Disconnect ignores this policy and never deletes branches.

## Project Search Settings

### Paths included in project search

Default: empty, meaning search the whole Project.

Each entry is a Project-root-relative file or directory. When non-empty, Project Search only indexes matching paths and directory descendants.

### Paths excluded from project search

Each entry is a Project-root-relative file or directory. Excludes always win over includes. Directories exclude descendants.
