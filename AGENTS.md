# Fluidity

Fluidity is a singular software development application for managing the full workflow in one place: coding, terminals, git diffs, browser-based work, workspaces, issues, PR review, and agent-assisted development.

## Core Concepts

- **Projects**: root directories, usually repositories, that Fluidity can open and manage.
- **Workspaces**: project-scoped working environments, usually backed by isolated git worktrees when version-controlled.
- **Tiles**: movable, resizable UI objects with one focused purpose, such as code editor, terminal, git diff, browser, or workspace viewer.
- **Arrangements**: reusable project templates defining the default tile layout and optional startup actions for new workspaces.

## Product Direction

Fluidity should reduce context switching and mental fatigue by making one application the home for the software development lifecycle.

Design priorities:

- Keyboard-first navigation.
- Fast switching between active workspaces.
- Isolated agent work by default via git worktrees.
- Frugal, durable abstractions over feature-specific complexity.
- Project-specific defaults with room for global reusable tile configuration.

Keep this file concise. Move detailed research, decisions, and specifications into `docs/` as needed.
