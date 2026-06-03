# Git worktrees live in app data

Fluidity creates Git-backed Workspace worktrees under Rust-owned app data instead of inside or beside the Registered Project root. This keeps the selected Project root as the stable registration point, avoids polluting repositories or their parents, and works when the Project root's parent directory is not writable; Project Settings can add a different worktree location later.
