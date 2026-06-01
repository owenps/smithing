import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceContext } from "./types";

export function getWorkspaceContext(): Promise<WorkspaceContext> {
  return invoke<WorkspaceContext>("workspace_context");
}
