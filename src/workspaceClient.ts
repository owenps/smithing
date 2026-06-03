import { invoke } from "@tauri-apps/api/core";
import type {
  CurrentWorkspaceResponse,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceTileStateSaveRequest,
} from "./types";

export function getCurrentWorkspace(): Promise<CurrentWorkspaceResponse | null> {
  return invoke<CurrentWorkspaceResponse | null>("workspace_current");
}

export function saveWorkspaceTileState(request: WorkspaceTileStateSaveRequest): Promise<void> {
  return invoke<void>("workspace_tile_state_save", { request });
}

export function createWorkspace(request: WorkspaceCreateRequest): Promise<WorkspaceCreateResponse> {
  return invoke<WorkspaceCreateResponse>("workspace_create", { request });
}
