import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";

export interface AvailableUpdate {
  version: string;
  date?: string;
  notes?: string;
  notesUrl: string;
  install: () => Promise<void>;
}

export async function checkForAvailableUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauriRuntime()) return null;

  const update = await check();
  if (!update) return null;

  return {
    version: update.version,
    date: update.date,
    notes: update.body,
    notesUrl: releaseNotesUrl(update),
    install: () => update.downloadAndInstall(),
  };
}

export async function relaunchApplication(): Promise<void> {
  await relaunch();
}

export async function openReleaseNotes(url: string): Promise<void> {
  await invoke("open_external_url", { url });
}

function releaseNotesUrl(update: Update): string {
  const notesUrl = update.rawJson.notesUrl;
  if (typeof notesUrl === "string" && notesUrl.length > 0) return notesUrl;

  return `https://fluidity.build/releases/${update.version.replace(/^v/, "")}`;
}

function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}
