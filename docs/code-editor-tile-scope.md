# Code Editor Tile Scope

## Direction

Add a primary coding surface to Fluidity.

- **Code Editor Tile**: an editor group with file tabs.
- **Files Tile**: optional Tile from the picker for browsing the Current Workspace root.
- Multiple Code Editor Tiles may be open at once, like editor groups.
- The default Workspace Tile State remains Workspaces + Terminal for now.

## Editor engine decision

Proceed with Monaco for the next Code Editor Tile slices.

Issue #27 spike result:

- Added a tile-shaped Monaco editor as `Code Editor` in the tile picker.
- Monaco renders inside Fluidity's grid/tile shell with `automaticLayout` and Vite worker packaging.
- `monaco-vim` loads and supports enough core flows to keep evaluating in-product: normal/insert transitions, h/j/k/l, word motions, operators, visual mode, search, undo/redo, and `:w`/`⌘S` scratch-buffer save wiring.
- App-level shortcuts still win at window capture phase. Known conflicts for editor users: `⌘D` split vs add selection, `⌘⌫` close tile vs delete line, `⌥H/J/K/L` tile focus vs editor text input, `Esc` exits tile focus mode before Vim when focus mode is active.
- File read/write now exists for a single open tab via Workspace-safe backend commands, with UTF-8/size/path checks and version conflict detection.
- Find/save/tabs look feasible: Monaco has built-in find, commands can bind save, and the tab strip can become persisted editor-group state.
- Bundle impact exists: current Vite build emits ~4.5 MB main JS plus ~252 KB editor worker. Accept for the MVP bet, but use lazy loading/language caps if startup or package size regresses.

Keep CodeMirror as fallback if extended Vim testing finds blocking operator/search/ex command bugs.

## MVP promise

A user can add a Files Tile and one or more Code Editor Tiles, browse Workspace files, open files into editor tabs, edit/save safely, use Vim mode when enabled, and return to a Workspace with editor groups restored.

## MVP capabilities

- Add Code Editor Tile from tile picker.
- Add Files Tile from tile picker.
- Files Tile browses the Current Workspace root.
- Files Tile opens files into the focused Code Editor Tile, then most-recent Code Editor Tile, otherwise creates/prompts for one.
- Code Editor Tile supports tabs, active tab, dirty indicators, close tab.
- Save current file and save all dirty files.
- Dirty-buffer guards for tile close, tab close, Workspace switch/discard, Project disconnect, Application Reset, and app close.
- Workspace-safe file read/write/list commands.
- UTF-8 text files only at first.
- Size cap for opened files.
- External file change detection with reload/overwrite choice.
- Global Vim mode setting.
- Persist open tabs, active tab, cursor/scroll/view state, and editor group geometry per Workspace.

## Non-goals for MVP

- LSP, diagnostics, autocomplete, go-to-definition, rename/refactor.
- Git diff/review UI.
- File create/rename/delete from Files Tile.
- Binary/large-file editing.
- Remote filesystem support.
- Treating Code Editor Tile as a full VS Code replacement on day one.

## Tile model

Add Tile kinds:

- `code`: Code Editor Tile / editor group.
- `files`: Files Tile.

Code Editor Tile persisted state:

- `kind: "code"`
- `title`
- geometry
- open tabs with Workspace-root-relative paths
- active tab path
- per-file view state: cursor, selection, scroll

Files Tile persisted state:

- `kind: "files"`
- `title`
- geometry
- expanded directories, selection, optional filter state

## File safety

Backend commands must enforce Workspace root boundaries:

- paths must be relative
- reject absolute paths and `..`
- canonicalized paths must remain under Workspace root
- UTF-8 only
- size cap
- write conflict check using mtime or content version

Likely commands:

- `files_tree_list({ workspaceId, path })`
- `code_file_read({ workspaceId, path })`
- `code_file_write({ workspaceId, path, contents, expectedVersion })`
- `code_file_search({ workspaceId, query, limit })`

## Implementation slices

1. Prototype Monaco + Vim mode.
2. Add persistable Code Editor Tile and Files Tile shells.
3. Open a read-only file from Files Tile into a Code Editor tab.
4. Add editing, save, dirty indicators, and conflict checks.
5. Add dirty-loss guards across Workspace and app flows.
6. Add multiple editor groups and open-target routing.
7. Add Quick Open.
8. Persist editor group tabs and view state.
9. Polish Files Tile navigation and restore state.

## Risks

- Vim mode quality may force editor engine change.
- App-level keyboard commands may fight editor shortcuts.
- Dirty-buffer safety cuts across existing Workspace lifecycle flows.
- File tree performance can regress on large Projects without caps/lazy loading.
- Monaco bundle size and Tauri packaging need checking.

## Definition of done

- User can browse Workspace files in a Files Tile.
- User can open files into one or more Code Editor Tiles.
- User can edit and save with Vim mode enabled or disabled.
- Fluidity never silently loses dirty editor buffers.
- Workspace restore reopens editor groups/tabs/view state.
- File IO cannot escape the Workspace root.
- `pnpm build`, `pnpm lint`, and Rust tests pass.
