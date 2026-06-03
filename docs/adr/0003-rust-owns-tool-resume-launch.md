# Rust owns Tool Tile resume launch

Fluidity applies Tool Resume Provider behavior in the Rust/Tauri terminal session creation layer rather than injecting commands from React after a shell starts. Rust already owns process creation, workspace-root validation, and app-state persistence, so provider-specific resume arguments can be assembled before launch while React stays responsible for rendering and passing structured tile intent.
