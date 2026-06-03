import { invoke } from "@tauri-apps/api/core";
import type { ApplicationResetRequest, ApplicationResetResponse } from "./types";

export function resetApplication(
  request: ApplicationResetRequest,
): Promise<ApplicationResetResponse> {
  if (!isRunningInTauri()) {
    return Promise.resolve({
      overview: { current: null, currentWorkspaceId: null, openWorkspaces: [] },
      dirtyConfirmation: null,
      warnings: [],
    });
  }

  return invoke<ApplicationResetResponse>("application_reset", { request });
}

function isRunningInTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
