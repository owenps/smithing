# `smithing`

The single-window workspace engine built for coordinating parallel AI agent tasks across automated, tile-based Git worktrees.

`smithing` comes from the simple desire to reduce context switching across multiple applications.

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
