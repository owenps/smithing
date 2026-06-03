# Tool Tiles are distinct from Terminal Tiles

Fluidity represents external development tools as Tool Tiles instead of Terminal Tiles with an initial command, even when they are rendered through a terminal today. This keeps normal Terminal Tiles fresh and shell-like, gives Tool Tiles an explicit place for provider-specific resume behavior, and avoids inferring domain meaning from implementation details like `initialCommand`.
