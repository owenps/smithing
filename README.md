# `smithing`

<p>
  <a href="https://github.com/owenps/smithing/actions/workflows/checks.yml"><img src="https://github.com/owenps/smithing/actions/workflows/checks.yml/badge.svg" alt="Lint and Check" /></a> &nbsp;
  <a href="https://github.com/owenps/smithing/tags"><img src="https://img.shields.io/github/v/tag/owenps/smithing?label=release&sort=semver" alt="Latest release tag" /></a>
</p>

A desktop workspace for coordinating multiple AI coding agents, built to stay flexible around how you work.

`smithing` comes from the simple desire to reduce context switching across multiple applications.

Currently available only for <a href="https://www.apple.com/macos/"><kbd><img src="https://cdn.simpleicons.org/apple/white" width="16" valign="middle" /> macOS</kbd></a>.&nbsp;

## Stack

<p>
  <a href="https://tauri.app/"><kbd><img src="https://cdn.simpleicons.org/tauri" width="16" valign="middle" /> Tauri</kbd></a> &nbsp;
  <a href="https://www.rust-lang.org/"><kbd><img src="https://cdn.simpleicons.org/rust/DEA584" width="16" valign="middle" /> Rust</kbd></a> &nbsp;
  <a href="https://react.dev/"><kbd><img src="https://cdn.simpleicons.org/react" width="16" valign="middle" /> React</kbd></a> &nbsp;
  <a href="https://www.typescriptlang.org/"><kbd><img src="https://cdn.simpleicons.org/typescript" width="16" valign="middle" /> TypeScript</kbd></a> &nbsp;
</p>

## Core Features

* **Native Git Worktree Support 𖣂** — Every feature, bugfix, or experiment gets its own isolated worktree. No stashing, no branch juggling. Spin up and switch instantly.
* **Flexible Tile Workspaces ⊞** — Build your workspace out of tiles: code editors, terminals, git diffs, browsers, issue views, PR reviews, and agent sessions. Arrange them however the task demands.
* **Keyboard-First Navigation ⚡︎** — Move fast without reaching for the mouse. Vim-friendly navigation, quick switching, and command-driven workflows throughout.
* **Integrated Git Review ⎇** — Review diffs, inspect changes, compare branches, and manage work-in-progress without leaving the app.
* **Reusable Arrangements ⟡** — Define project-specific workspace templates so common workflows open with the right tiles, layout, and startup actions already in place.

## Showcase

> [!NOTE]
> Coming soon w/ stable release! ⸜(˶˃ ᵕ ˂˶)⸝

## Installation

> [!IMPORTANT]
> Stable release coming soon! (˶ᵔ ᵕ ᵔ˶)

## Development

```sh
pnpm install
pnpm tauri dev
```

Useful checks:

```sh
pnpm build
pnpm lint
pnpm format:check
cd src-tauri && cargo check && cargo fmt --check && cargo clippy -- -D warnings
```

Requires Rust/Cargo and the Tauri system dependencies for macOS.
