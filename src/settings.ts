import { defaultThemeId, normalizeThemeId, type ThemeId } from "./themeRegistry";
import {
  createDefaultTilePickerVisibility,
  defaultConfigurableTilePickerItems,
  type TilePickerVisibility,
} from "./tilePickerCatalog";
import type {
  CodeEditorSettings,
  DiffTileSettings,
  NotepadTileSettings,
  TerminalTileSettings,
  TileSettings,
} from "./types";

export const terminalFontSizeMin = 10;
export const terminalFontSizeMax = 24;
export const codeEditorFontSizeMin = 10;
export const codeEditorFontSizeMax = 24;
export const codeEditorTabSizeMin = 1;
export const codeEditorTabSizeMax = 8;

export type DiffColorPolarity = "standard" | "reversed";

export interface AppSettings {
  debugLayout: boolean;
  themeId: ThemeId;
  tileHeadersVisible: boolean;
  tileSettings: TileSettings;
  deletionPositiveStatColors: boolean;
  diffColorPolarity: DiffColorPolarity;
  workspaceBranchPrefix: string;
  tilePickerVisibility: TilePickerVisibility;
}

export function createDefaultTerminalTileSettings(): TerminalTileSettings {
  return { fontSize: 13 };
}

export function normalizeTerminalTileSettings(
  value: Partial<TerminalTileSettings> | null | undefined,
): TerminalTileSettings {
  const defaults = createDefaultTerminalTileSettings();
  return {
    fontSize:
      typeof value?.fontSize === "number" && Number.isFinite(value.fontSize)
        ? Math.min(terminalFontSizeMax, Math.max(terminalFontSizeMin, value.fontSize))
        : defaults.fontSize,
  };
}

export function createDefaultDiffTileSettings(): DiffTileSettings {
  return { reviewProgressVisible: false };
}

export function normalizeDiffTileSettings(
  value: Partial<DiffTileSettings> | null | undefined,
): DiffTileSettings {
  const defaults = createDefaultDiffTileSettings();
  return {
    reviewProgressVisible:
      typeof value?.reviewProgressVisible === "boolean"
        ? value.reviewProgressVisible
        : defaults.reviewProgressVisible,
  };
}

export function createDefaultNotepadTileSettings(): NotepadTileSettings {
  return { markdownEnabled: true };
}

export function normalizeNotepadTileSettings(
  value: Partial<NotepadTileSettings> | null | undefined,
): NotepadTileSettings {
  const defaults = createDefaultNotepadTileSettings();
  return {
    markdownEnabled:
      typeof value?.markdownEnabled === "boolean"
        ? value.markdownEnabled
        : defaults.markdownEnabled,
  };
}

export function createDefaultCodeEditorSettings(): CodeEditorSettings {
  return {
    lineNumbersVisible: true,
    minimapVisible: false,
    wordWrap: true,
    fontSize: 13,
    tabSize: 2,
    vimMode: true,
    bracketPairColorization: true,
    stickyScroll: false,
    autoSave: "off",
    tabTitleMode: "path",
    tabsVisible: true,
  };
}

export function normalizeCodeEditorSettings(
  value: Partial<CodeEditorSettings> | null | undefined,
): CodeEditorSettings {
  const defaults = createDefaultCodeEditorSettings();
  return {
    lineNumbersVisible:
      typeof value?.lineNumbersVisible === "boolean"
        ? value.lineNumbersVisible
        : defaults.lineNumbersVisible,
    minimapVisible:
      typeof value?.minimapVisible === "boolean" ? value.minimapVisible : defaults.minimapVisible,
    wordWrap: typeof value?.wordWrap === "boolean" ? value.wordWrap : defaults.wordWrap,
    fontSize:
      typeof value?.fontSize === "number" && Number.isFinite(value.fontSize)
        ? Math.min(codeEditorFontSizeMax, Math.max(codeEditorFontSizeMin, value.fontSize))
        : defaults.fontSize,
    tabSize:
      typeof value?.tabSize === "number" && Number.isFinite(value.tabSize)
        ? Math.min(codeEditorTabSizeMax, Math.max(codeEditorTabSizeMin, Math.round(value.tabSize)))
        : defaults.tabSize,
    vimMode: typeof value?.vimMode === "boolean" ? value.vimMode : defaults.vimMode,
    bracketPairColorization:
      typeof value?.bracketPairColorization === "boolean"
        ? value.bracketPairColorization
        : defaults.bracketPairColorization,
    stickyScroll:
      typeof value?.stickyScroll === "boolean" ? value.stickyScroll : defaults.stickyScroll,
    autoSave:
      value?.autoSave === "onFocusChange" || value?.autoSave === "afterDelay"
        ? value.autoSave
        : defaults.autoSave,
    tabTitleMode: value?.tabTitleMode === "basename" ? "basename" : defaults.tabTitleMode,
    tabsVisible: typeof value?.tabsVisible === "boolean" ? value.tabsVisible : defaults.tabsVisible,
  };
}

export function createDefaultTileSettings(): TileSettings {
  return {
    terminal: createDefaultTerminalTileSettings(),
    codeEditor: createDefaultCodeEditorSettings(),
    diff: createDefaultDiffTileSettings(),
    notepad: createDefaultNotepadTileSettings(),
  };
}

export function normalizeTileSettings(
  value:
    | {
        terminal?: Partial<TerminalTileSettings> | null;
        codeEditor?: Partial<CodeEditorSettings> | null;
        diff?: Partial<DiffTileSettings> | null;
        notepad?: Partial<NotepadTileSettings> | null;
      }
    | null
    | undefined,
): TileSettings {
  return {
    terminal: normalizeTerminalTileSettings(value?.terminal),
    codeEditor: normalizeCodeEditorSettings(value?.codeEditor),
    diff: normalizeDiffTileSettings(value?.diff),
    notepad: normalizeNotepadTileSettings(value?.notepad),
  };
}

export function createDefaultAppSettings(debugLayout = false): AppSettings {
  return {
    debugLayout,
    themeId: defaultThemeId,
    tileHeadersVisible: true,
    tileSettings: createDefaultTileSettings(),
    deletionPositiveStatColors: false,
    diffColorPolarity: "standard",
    workspaceBranchPrefix: "",
    tilePickerVisibility: createDefaultTilePickerVisibility(),
  };
}

export function normalizeAppSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const defaults = createDefaultAppSettings();
  const stored = value as
    | (Partial<AppSettings> & {
        codeEditorThemeId?: unknown;
        terminalFontSize?: unknown;
        codeEditor?: unknown;
      })
    | null
    | undefined;
  const storedTileSettings =
    stored?.tileSettings && typeof stored.tileSettings === "object"
      ? (stored.tileSettings as Partial<TileSettings>)
      : {};
  const legacyTerminalSettings =
    typeof stored?.terminalFontSize === "number"
      ? { fontSize: stored.terminalFontSize }
      : undefined;
  const legacyCodeEditorSettings =
    stored?.codeEditor && typeof stored.codeEditor === "object"
      ? (stored.codeEditor as Partial<CodeEditorSettings>)
      : undefined;

  return {
    debugLayout: typeof value?.debugLayout === "boolean" ? value.debugLayout : defaults.debugLayout,
    themeId: normalizeThemeId(stored?.themeId ?? stored?.codeEditorThemeId),
    tileHeadersVisible:
      typeof value?.tileHeadersVisible === "boolean"
        ? value.tileHeadersVisible
        : defaults.tileHeadersVisible,
    tileSettings: normalizeTileSettings({
      terminal: {
        ...legacyTerminalSettings,
        ...storedTileSettings.terminal,
      },
      codeEditor: {
        ...legacyCodeEditorSettings,
        ...storedTileSettings.codeEditor,
      },
      diff: storedTileSettings.diff,
      notepad: storedTileSettings.notepad,
    }),
    deletionPositiveStatColors:
      typeof value?.deletionPositiveStatColors === "boolean"
        ? value.deletionPositiveStatColors
        : defaults.deletionPositiveStatColors,
    diffColorPolarity: value?.diffColorPolarity === "reversed" ? "reversed" : "standard",
    workspaceBranchPrefix:
      typeof value?.workspaceBranchPrefix === "string" ? value.workspaceBranchPrefix : "",
    tilePickerVisibility: readTilePickerVisibility(
      value?.tilePickerVisibility,
      defaults.tilePickerVisibility,
    ),
  };
}

function readTilePickerVisibility(
  value: unknown,
  defaults: TilePickerVisibility,
): TilePickerVisibility {
  if (!value || typeof value !== "object") return defaults;

  const stored = value as Partial<Record<keyof TilePickerVisibility, unknown>>;
  const normalized = { ...defaults };

  for (const item of defaultConfigurableTilePickerItems) {
    const visible = stored[item.id];
    if (typeof visible === "boolean") {
      normalized[item.id] = visible;
    }
  }

  for (const [itemId, visible] of Object.entries(stored)) {
    if (typeof visible === "boolean") {
      normalized[itemId] = visible;
    }
  }

  return normalized as TilePickerVisibility;
}
