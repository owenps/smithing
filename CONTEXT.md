# Smithing

Smithing is a unified software development environment for keeping the full development workflow inside one application.

## Language

**Smithing**:
A local-first desktop application for coding, reviewing, managing work, and coordinating agent-assisted development inside one environment.
_Avoid_: IDE, editor, agent app, cloud IDE

**Project**:
A root directory that Smithing can open and manage as a unit.
_Avoid_: Repository, folder, codebase

**Workspace**:
A project-scoped working environment with one canonical filesystem root, used to pursue one stream of work independently from other streams.
_Avoid_: Window, session, branch

**Workspace Branch**:
A branch owned by one git-backed workspace and used as the change surface for that stream of work.
_Avoid_: Feature branch, task branch

**Discarded Workspace**:
A workspace that has been intentionally removed from Smithing and deleted from disk by the user.
_Avoid_: Archived workspace, closed workspace, hidden workspace

**Tile**:
A movable and resizable object inside a workspace, focused on one kind of work surface.
_Avoid_: Pane, panel, widget

**Workspace Grid**:
The fixed-cell surface inside a workspace where tiles are placed without overlap.
_Avoid_: Canvas, window manager, freeform layout

**Browser Tile**:
A tile for viewing and interacting with web pages from inside a workspace.
_Avoid_: WebView, embedded browser, tab

**Terminal Tile**:
A tile containing an interactive shell session for a workspace that should feel like opening a normal macOS terminal in that workspace.
_Avoid_: Command runner, output panel, console

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
