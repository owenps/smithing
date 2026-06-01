# Smithing

Smithing is a local-first desktop application for keeping coding, terminals, git work, browser-based work, and agent-assisted development in one workspace.

Current POC focus:

- Keyboard-first tiled workspace grid
- Native terminal tiles backed by PTYs
- Tile splitting, closing, resizing, focus movement, and focus mode
- Settings for terminal text size, tile headers, shortcut reference, and optional agent launchers

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
