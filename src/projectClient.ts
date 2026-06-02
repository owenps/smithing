import { invoke } from "@tauri-apps/api/core";
import type {
  ProjectAddResponse,
  ProjectRemoveRequest,
  ProjectRemoveResponse,
  RegisteredProject,
} from "./types";

export function listProjects(): Promise<RegisteredProject[]> {
  return invoke<RegisteredProject[]>("project_list");
}

export function addProject(): Promise<ProjectAddResponse> {
  return invoke<ProjectAddResponse>("project_add");
}

export function removeProject(request: ProjectRemoveRequest): Promise<ProjectRemoveResponse> {
  return invoke<ProjectRemoveResponse>("project_remove", { request });
}
