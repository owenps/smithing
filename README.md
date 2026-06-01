# `smithing`

The single-window workspace engine built for coordinating parallel AI agent tasks across automated, tile-based Git worktrees.

`smithing` comes from the simple desire to reduce context switching across multiple applications.

## Stack

<p>
  <a href="https://tauri.app/"><kbd><img src="https://cdn.simpleicons.org/tauri" width="16" valign="middle" /> Tauri</kbd></a> &nbsp;
  <a href="https://www.rust-lang.org/"><kbd><img src="https://cdn.simpleicons.org/rust/DEA584" width="16" valign="middle" /> Rust</kbd></a> &nbsp;
  <a href="https://react.dev/"><kbd><img src="https://cdn.simpleicons.org/react" width="16" valign="middle" /> React</kbd></a> &nbsp;
  <a href="https://www.typescriptlang.org/"><kbd><img src="https://cdn.simpleicons.org/typescript" width="16" valign="middle" /> TypeScript</kbd></a> &nbsp;
</p>

## Core Features

1. **Tiles** -- Fundamentally your workspace is organized into tiles, a tile can be code editor, terminal, git diff, or any other tool you need to work with.

## Installation

> [!NOTE]
> Stable release coming soon!

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
