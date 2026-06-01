import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  TerminalCloseRequest,
  TerminalCreateRequest,
  TerminalCreateResponse,
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalResizeRequest,
  TerminalWriteRequest,
} from "./types";

export function createTerminalSession(
  request: TerminalCreateRequest,
): Promise<TerminalCreateResponse> {
  return invoke<TerminalCreateResponse>("terminal_create", { request });
}

export function writeTerminalInput(request: TerminalWriteRequest): Promise<void> {
  return invoke<void>("terminal_write", { request });
}

export function resizeTerminalSession(request: TerminalResizeRequest): Promise<void> {
  return invoke<void>("terminal_resize", { request });
}

export function closeTerminalSession(request: TerminalCloseRequest): Promise<void> {
  return invoke<void>("terminal_close", { request });
}

export function onTerminalOutput(
  handler: (event: TerminalOutputEvent) => void,
): Promise<UnlistenFn> {
  return listen<TerminalOutputEvent>("terminal://output", (event) => handler(event.payload));
}

export function onTerminalExit(handler: (event: TerminalExitEvent) => void): Promise<UnlistenFn> {
  return listen<TerminalExitEvent>("terminal://exit", (event) => handler(event.payload));
}
