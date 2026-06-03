import {
  createDefaultTilePickerVisibility,
  configurableTilePickerItems,
  type TilePickerVisibility,
} from "./tilePickerCatalog";

const settingsStorageKey = "fluidity.settings.v1";
const deltaSettingsStorageKey = "delta.settings.v1";
const terminalFontSizeMin = 10;
const terminalFontSizeMax = 24;

export interface AppSettings {
  debugLayout: boolean;
  terminalFontSize: number;
  tileHeadersVisible: boolean;
  tilePickerVisibility: TilePickerVisibility;
}

interface StoredSettings {
  debugLayout?: unknown;
  terminalFontSize?: unknown;
  tileHeadersVisible?: unknown;
  tilePickerVisibility?: unknown;
}

export function createDefaultAppSettings(debugLayout: boolean): AppSettings {
  return {
    debugLayout,
    terminalFontSize: 13,
    tileHeadersVisible: true,
    tilePickerVisibility: createDefaultTilePickerVisibility(),
  };
}

export function readAppSettings(defaultDebugLayout: boolean): AppSettings {
  const defaults = createDefaultAppSettings(defaultDebugLayout);
  if (typeof window === "undefined") return defaults;

  try {
    const rawSettings =
      window.localStorage.getItem(settingsStorageKey) ??
      window.localStorage.getItem(deltaSettingsStorageKey);
    if (!rawSettings) return defaults;

    const stored = JSON.parse(rawSettings) as StoredSettings;
    return {
      debugLayout:
        typeof stored.debugLayout === "boolean" ? stored.debugLayout : defaults.debugLayout,
      terminalFontSize:
        typeof stored.terminalFontSize === "number" && Number.isFinite(stored.terminalFontSize)
          ? Math.min(terminalFontSizeMax, Math.max(terminalFontSizeMin, stored.terminalFontSize))
          : defaults.terminalFontSize,
      tileHeadersVisible:
        typeof stored.tileHeadersVisible === "boolean"
          ? stored.tileHeadersVisible
          : defaults.tileHeadersVisible,
      tilePickerVisibility: readTilePickerVisibility(
        stored.tilePickerVisibility,
        defaults.tilePickerVisibility,
      ),
    };
  } catch {
    return defaults;
  }
}

export function writeAppSettings(settings: AppSettings) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(settingsStorageKey, JSON.stringify(settings));
  } catch {
    // Ignore storage failures so settings remain usable for the current session.
  }
}

export function clearAppSettings() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(settingsStorageKey);
    window.localStorage.removeItem(deltaSettingsStorageKey);
  } catch {
    // Ignore storage failures so reset can still clear in-memory state.
  }
}

function readTilePickerVisibility(
  value: unknown,
  defaults: TilePickerVisibility,
): TilePickerVisibility {
  if (!value || typeof value !== "object") return defaults;

  const stored = value as Partial<Record<keyof TilePickerVisibility, unknown>>;
  return Object.fromEntries(
    configurableTilePickerItems.map((item) => [
      item.id,
      typeof stored[item.id] === "boolean" ? stored[item.id] : defaults[item.id],
    ]),
  ) as TilePickerVisibility;
}
