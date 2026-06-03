# Persist workspace structure, not live tile runtime state

Fluidity persists Registered Projects, Open Workspaces, the Current Workspace, and Workspace Tile State in Rust-owned private app-state JSON. Workspace Tile State includes tile definitions, tile geometry, and Tile Resume Metadata, but excludes focus, fullscreen, and live tile runtime state because those states are transient or tile-specific; tiles launch fresh after restart unless a tile kind explicitly supports Tile Resume Metadata.
