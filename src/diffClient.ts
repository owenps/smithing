import { invoke } from "@tauri-apps/api/core";
import type { CurrentWorkspaceGitPatchResponse } from "./types";

export function getCurrentWorkspaceGitPatch(): Promise<CurrentWorkspaceGitPatchResponse> {
  return invoke<CurrentWorkspaceGitPatchResponse>("workspace_git_patch_current");
}
