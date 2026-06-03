import { invoke } from "@tauri-apps/api/core";
import type {
  WorkspaceDiscardRequest,
  WorkspaceDiscardResponse,
  WorkspaceOverview,
  WorkspaceCreateRequest,
  WorkspaceCreateResponse,
  WorkspaceSwitchRequest,
  WorkspaceSwitchResponse,
  WorkspaceTileStateSaveRequest,
} from "./types";

export function getWorkspaceOverview(): Promise<WorkspaceOverview> {
  return invoke<WorkspaceOverview>("workspace_overview");
}

export function saveWorkspaceTileState(request: WorkspaceTileStateSaveRequest): Promise<void> {
  return invoke<void>("workspace_tile_state_save", { request });
}

export function createWorkspace(request: WorkspaceCreateRequest): Promise<WorkspaceCreateResponse> {
  return invoke<WorkspaceCreateResponse>("workspace_create", { request });
}

export function discardWorkspace(
  request: WorkspaceDiscardRequest,
): Promise<WorkspaceDiscardResponse> {
  return invoke<WorkspaceDiscardResponse>("workspace_discard", { request });
}

export function switchWorkspace(request: WorkspaceSwitchRequest): Promise<WorkspaceSwitchResponse> {
  return invoke<WorkspaceSwitchResponse>("workspace_switch", { request });
}
