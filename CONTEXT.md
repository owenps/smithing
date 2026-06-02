# Smithing

Smithing is a unified software development environment for keeping the full development workflow inside one application.

## Language

**Smithing**:
A local-first desktop application for coding, reviewing, managing work, and coordinating agent-assisted development inside one environment.
_Avoid_: IDE, editor, agent app, cloud IDE

**Project**:
A root directory that Smithing can register and manage as a unit.
_Avoid_: Repository, folder, codebase

**Workspace**:
A project-scoped working environment with one canonical filesystem root, used to pursue one stream of work independently from other streams.
_Avoid_: Window, session, branch

**Open Workspace**:
A workspace currently present in Smithing and eligible to have its Workspace Tile State restored after restart.
_Avoid_: Tab, window, session

**Current Workspace**:
The open workspace currently being shown to the user.
_Avoid_: Active tab, selected session, current window

**Workspace Branch**:
A branch owned by one git-backed workspace and used as the change surface for that stream of work.
_Avoid_: Feature branch, task branch

**Home Workspace**:
The default workspace for a project that is not backed by git, rooted at the project root.
_Avoid_: Main workspace, default workspace

**Discarded Workspace**:
A workspace that has been intentionally removed from Smithing and deleted from disk by the user.
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
A known way for Smithing to turn Tile Resume Metadata into launch or resume behavior for a Tool Tile.
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

**Tool Tile**:
A tile centered on an external development tool or long-running tool experience, such as an agent or third-party development tool.
_Avoid_: Command Tile, Agent Tile, third-party tile, command runner

**Arrangement**:
A reusable template that defines the default collection and layout of tiles for new workspaces in a project.
_Avoid_: Layout, template, preset

**Command**:
A named user action that can be invoked from the keyboard or command palette.
_Avoid_: Action, shortcut, menu item

**Settings**:
Global user preferences that apply across Smithing.
_Avoid_: Preferences, config

**Project Settings**:
Preferences that apply to one project.
_Avoid_: Repository settings, folder settings

**Registered Project**:
A project root saved in Smithing so its workspaces can be opened and managed later.
_Avoid_: Open project, recent folder, repository bookmark, workspace

**Project Registry**:
The global collection of registered projects known to Smithing.
_Avoid_: Project settings, recent projects, folder list

**Integration**:
A product-level connection to an external tool or platform that can inform one or more Tiles, provide Tile Resume Metadata behavior, or support workflow-specific surfaces such as PR review or PR status.
_Avoid_: plugin, extension, tool tile

**Integration Tile**:
A Tile provided by an Integration, such as a Claude CLI Tile, GitHub PR Reviewer Tile, or GitHub PR Status Tile.
_Avoid_: tile offering, capability, feature, tool
