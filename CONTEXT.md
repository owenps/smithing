# Fluidity

Fluidity is a unified software development environment for keeping the full development workflow inside one application.

## Language

**Fluidity**:
A local-first desktop application for coding, reviewing, managing work, and coordinating agent-assisted development inside one environment.
_Avoid_: IDE, editor, agent app, cloud IDE

**Project**:
A root directory that Fluidity can register and manage as a unit.
_Avoid_: Repository, folder, codebase

**Git-backed Project**:
A Project whose root is managed by git and whose Workspaces use Workspace Branches for isolated streams of work.
_Avoid_: Repository, git repo

**Workspace**:
A project-scoped working environment with one canonical filesystem root, used to pursue one stream of work independently from other streams.
_Avoid_: Window, session, branch

**Git-backed Workspace**:
A Workspace for a Git-backed Project whose canonical filesystem root is an isolated git worktree and whose changes belong to its Workspace Branch.
_Avoid_: Checkout, clone, branch

**Open Workspace**:
A workspace currently present in Fluidity whether or not it is the one currently shown to the user. Open Workspaces are parallel working environments, not stopped sessions waiting to be resumed.
_Avoid_: Tab, window, session

**Current Workspace**:
The open workspace currently being shown to the user.
_Avoid_: Active tab, selected session, current window

**Workspace Stack**:
The ordered set of Open Workspaces used for workspace switching, with the most recently shown Workspace first.
_Avoid_: Workspace tabs, workspace list, recent sessions, last-used order

**Dirty Workspace**:
A discardable Git-backed Workspace with uncommitted worktree or index changes that would be lost if its Fluidity-managed filesystem root were deleted.
_Avoid_: Modified workspace, unsaved workspace

**Workspace Attention State**:
The user-facing attention status of an Open Workspace, such as unread activity or needing input.
_Avoid_: Workspace telemetry, notification state

**Unread Workspace**:
An Open Workspace with activity the user has not viewed since it happened.
_Avoid_: Active workspace, unseen workspace

**Workspace Branch**:
The branch currently checked out in a Git-backed Workspace and used as the change surface for that stream of work, even if renamed after Workspace creation. Fluidity-generated Workspace Branch names are unique across Fluidity and are not reused after discard.
_Avoid_: Feature branch, task branch

**Workspace Branch Prefix**:
Optional user- or project-chosen text prepended to generated Workspace Branch names; the default is no prefix.
_Avoid_: Fluidity prefix, branch namespace

**Workspace Branch Discard Policy**:
A Project Setting that controls whether discarding a Git-backed Workspace also deletes its local Workspace Branch when safe; the default is to keep the branch. Remote branches are outside this policy.
_Avoid_: Branch cleanup, auto-delete branch

**Workspace Base Branch**:
The branch or remote-tracking ref used as the starting point for a new Git-backed Workspace's Workspace Branch, normally the Project's default upstream branch.
_Avoid_: Starting branch, parent branch, source branch

**Home Workspace**:
The default workspace for a project that is not backed by git, rooted at the project root.
_Avoid_: Main workspace, default workspace

**Discarded Workspace**:
A discardable Workspace that has been intentionally removed from Fluidity by the user, causing its Fluidity-managed filesystem root to be deleted from disk. Home Workspaces rooted at Project roots are not discardable.
_Avoid_: Archived workspace, closed workspace, hidden workspace

**Tile**:
A movable and resizable object inside a workspace, focused on one kind of work surface.
_Avoid_: Pane, panel, widget

**Workspace Tile State**:
The restorable tile collection for an open workspace, including tile definitions, tile geometry, and Tile Resume Metadata, but excluding transient focus, fullscreen, and live tile runtime state.
_Avoid_: Layout, arrangement, tile session

**Tile Resume Metadata**:
Durable, tile-kind-specific information stored with a tile definition so the tile can reconnect to or resume an external experience without preserving the live runtime itself.
_Avoid_: Runtime state, session state, terminal state

**Tool Resume Provider**:
A known way for Fluidity to turn Tile Resume Metadata into launch or resume behavior for a Tool Tile.
_Avoid_: Backend, resumable backend, session manager

**Workspace Grid**:
The fixed-cell surface inside a workspace where tiles are placed without overlap.
_Avoid_: Canvas, window manager, freeform layout

**Browser Tile**:
A tile for viewing and interacting with web pages from inside a workspace.
_Avoid_: WebView, embedded browser, tab

**Workspace Switcher Tile**:
A tile for viewing and switching between open workspaces.
_Avoid_: Tab bar, workspace tabs, active workspace list

**Terminal Tile**:
A tile containing an interactive shell session for a workspace that should feel like opening a normal macOS terminal in that workspace.
_Avoid_: Command runner, output panel, console

**Terminal Session Runtime**:
The live PTY-backed runtime machinery used to create, render, resize, write to, and close terminal-rendered sessions for Terminal Tiles and terminal-rendered Tool Tiles, excluding durable Workspace Tile State and Tile Resume Metadata ownership.
_Avoid_: Terminal Tile Runtime, terminal state, terminal session state

**Tool Tile**:
A tile centered on an external development tool or long-running tool experience, such as an agent or third-party development tool.
_Avoid_: Command Tile, Agent Tile, third-party tile, command runner

**Arrangement**:
A reusable template that defines the default collection and layout of tiles for new workspaces in a project.
_Avoid_: Layout, template, preset

**Command**:
A named user action that can be invoked from the keyboard or command palette.
_Avoid_: Action, shortcut, menu item

**Keybind**:
A keyboard input mapped to a Command.
_Avoid_: Keyboard shortcut, hotkey

**Settings**:
Global user preferences that apply across Fluidity.
_Avoid_: Preferences, config, general settings

**Project Settings**:
Preferences that apply to one project and may override matching Settings defaults.
_Avoid_: Repository settings, folder settings

**Settings View**:
An app-level surface for viewing and changing Settings and Project Settings, separate from any Workspace's Tiles.
_Avoid_: Settings modal, Settings tile, Preferences window

**Settings Category**:
A named grouping of related Settings within the Settings View.
_Avoid_: Settings tab, Preferences pane

**Registered Project**:
A project root saved in Fluidity so its workspaces can be opened and managed later.
_Avoid_: Open project, recent folder, repository bookmark, workspace

**Unavailable Registered Project**:
A Registered Project whose Project root cannot currently be accessed by Fluidity.
_Avoid_: Missing project, deleted project

**Project Disconnect**:
The user action that removes a Registered Project from Fluidity, closes its Open Workspaces, and removes their Fluidity-managed filesystem roots without deleting the Project root or branches.
_Avoid_: Delete project, remove repository, unregister project

**Application Reset**:
The user action that returns Fluidity to its unregistered starting state, closes all Open Workspaces, and removes Fluidity-managed filesystem roots without deleting Project roots or branches.
_Avoid_: Factory reset, clear cache, uninstall

**Project Registry**:
The global collection of registered projects known to Fluidity.
_Avoid_: Project settings, recent projects, folder list

**Fluidity Core**:
The app-owned foundation that ships with Fluidity and owns durable platform responsibilities such as Projects, Workspaces, Tiles, Commands, Settings, persistence, security boundaries, and Extension loading.
_Avoid_: Core package, platform package, built-in extension

**Core Extension Pack**:
An always-present first-party Extension package that ships with Fluidity and contributes default user-facing capabilities through the same supported extension points available to other Extensions.
_Avoid_: Fluidity Core, built-ins, default features

**Extension**:
A user- or Fluidity-provided package that contributes capabilities to Fluidity through supported extension points.
_Avoid_: Plugin, add-on, mod

**Global Extension**:
An Extension installed for this Fluidity app installation and available across all Projects and Workspaces.
_Avoid_: User Extension, personal extension, app extension

**Project Extension**:
An Extension associated with a Project and available for that Project's Workspaces.
_Avoid_: Repository extension, local plugin, workspace extension

**Extension Definition**:
A static description of an Extension's identity and declared contributions, stored in an extension manifest file such as `fluidity.extension.json`.
_Avoid_: Manifest, descriptor, extension config

**Extension Identity**:
The stable identifier used to distinguish an Extension and resolve its contributed capabilities across reloads and app updates.
_Avoid_: Package name, plugin id, source path

**Extension Point**:
A supported kind of contribution that an Extension can add to Fluidity.
_Avoid_: Hook, API endpoint, customization seam

**Integration Tile Contribution**:
An Extension Point for adding an Integration Tile to Fluidity.
_Avoid_: Custom tool tile, tile plugin, agent tile definition

**Integration**:
A product-level connection to an external tool or platform that can inform one or more Tiles, provide Tile Resume Metadata behavior, or support workflow-specific surfaces such as PR review or PR status. An Integration may be built into Fluidity Core or contributed by an Extension.
_Avoid_: Provider, Extension, plugin, tool tile

**Integration Tile**:
A Tile for an external tool or platform provided by an Integration, such as a Claude CLI Tile, GitHub PR Reviewer Tile, or GitHub PR Status Tile.
_Avoid_: tile offering, capability, feature, tool
