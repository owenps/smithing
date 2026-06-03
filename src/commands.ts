import commandsManifest from "./commandsManifest.json";
import type { Direction, Tile } from "./types";
import {
  canResizeTile,
  closeTile,
  findTile,
  focusTileInDirection,
  resizeTile,
  splitFocusedTileInDirection,
  type TileSplitDirection,
} from "./tileLayout";

export interface AppCommandState {
  tiles: Tile[];
  focusedTileId: string | null;
  focusModeTileId: string | null;
}

export interface AppCommandApi {
  getState: () => AppCommandState;
  setTiles: (updater: (tiles: Tile[]) => Tile[]) => void;
  setFocusedTileId: (tileId: string | null) => void;
  setFocusModeTileId: (updater: (tileId: string | null) => string | null) => void;
  openTilePicker: () => void;
  openWorkspacePicker: () => void;
  openSettings: () => void;
  addProject: () => void;
  discardWorkspace: () => void;
}

export interface Command {
  id: string;
  title: string;
  canRun: (state: AppCommandState) => boolean;
  run: (api: AppCommandApi) => void;
}

export interface KeyboardShortcut {
  id: string;
  title: string;
  keyChords: string[][];
}

export interface KeyboardShortcutGroup {
  title: string;
  shortcuts: KeyboardShortcut[];
}

interface KeyboardShortcutBinding {
  key: string;
  meta?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  displayKeys: string[];
}

interface CommandManifestEntry {
  id: string;
  title: string;
  shortcutGroup?: string;
  shortcut?: KeyboardShortcutBinding;
  shortcuts?: KeyboardShortcutBinding[];
}

const commandMetadata = commandsManifest as CommandManifestEntry[];
const shortcutGroupOrder = ["General", "Tiles", "Focus", "Layout"];
const directions = ["left", "down", "up", "right"] as const;
const tileSplitDirections = ["right", "down"] as const;

export const keyboardShortcutGroups: KeyboardShortcutGroup[] = shortcutGroupOrder
  .map((title) => ({
    title,
    shortcuts: commandMetadata
      .filter((command) => command.shortcutGroup === title && shortcutsForCommand(command).length)
      .map((command) => ({
        id: command.id,
        title: command.title,
        keyChords: shortcutsForCommand(command).map((shortcut) => shortcut.displayKeys),
      })),
  }))
  .filter((group) => group.shortcuts.length > 0);

function requiresFocusedTile(state: AppCommandState): boolean {
  return Boolean(findTile(state.tiles, state.focusedTileId));
}

function requiresFocusedTileOutsideFocusMode(state: AppCommandState): boolean {
  return !state.focusModeTileId && requiresFocusedTile(state);
}

export function createCommands(): Command[] {
  return commandMetadata.map((metadata) => {
    const behavior = behaviorForCommand(metadata.id);
    return {
      id: metadata.id,
      title: metadata.title,
      canRun: behavior.canRun,
      run: behavior.run,
    };
  });
}

export function commandIdForKeyboardEvent(event: KeyboardEvent): string | null {
  const command = commandMetadata.find((metadata) =>
    shortcutsForCommand(metadata).some((shortcut) => matchesShortcut(event, shortcut)),
  );
  return command?.id ?? null;
}

function behaviorForCommand(commandId: string): Pick<Command, "canRun" | "run"> {
  if (commandId === "settings.open") {
    return {
      canRun: () => true,
      run: (api) => api.openSettings(),
    };
  }

  if (commandId === "project.add") {
    return {
      canRun: () => true,
      run: (api) => api.addProject(),
    };
  }

  if (commandId === "workspace.new") {
    return {
      canRun: () => true,
      run: (api) => api.openWorkspacePicker(),
    };
  }

  if (commandId === "workspace.discard") {
    return {
      canRun: () => true,
      run: (api) => api.discardWorkspace(),
    };
  }

  if (commandId === "tilePicker.open") {
    return {
      canRun: requiresFocusedTileOutsideFocusMode,
      run: (api) => api.openTilePicker(),
    };
  }

  if (commandId === "tile.close") {
    return {
      canRun: requiresFocusedTile,
      run: (api) => {
        const closingTileId = api.getState().focusedTileId;
        const result = closeTile(api.getState().tiles, closingTileId);
        api.setTiles(() => result.tiles);
        api.setFocusedTileId(result.focusedTileId);
        api.setFocusModeTileId((focusModeTileId) =>
          focusModeTileId === closingTileId ? null : focusModeTileId,
        );
      },
    };
  }

  if (commandId === "tile.focusMode.toggle") {
    return {
      canRun: requiresFocusedTile,
      run: (api) => {
        const focusedTileId = api.getState().focusedTileId;
        api.setFocusModeTileId((focusModeTileId) =>
          focusModeTileId === focusedTileId ? null : focusedTileId,
        );
      },
    };
  }

  const directionalCommand = parseDirectionalCommand(commandId);
  if (directionalCommand?.verb === "focus") {
    return {
      canRun: requiresFocusedTileOutsideFocusMode,
      run: (api) => {
        api.setFocusedTileId(
          focusTileInDirection(
            api.getState().tiles,
            api.getState().focusedTileId,
            directionalCommand.direction,
          ),
        );
      },
    };
  }

  if (directionalCommand?.verb === "resize") {
    return {
      canRun: (state) =>
        requiresFocusedTileOutsideFocusMode(state) &&
        canResizeTile(state.tiles, state.focusedTileId, directionalCommand.direction),
      run: (api) => {
        api.setTiles((tiles) =>
          resizeTile(tiles, api.getState().focusedTileId, directionalCommand.direction),
        );
      },
    };
  }

  if (directionalCommand?.verb === "split") {
    return {
      canRun: requiresFocusedTileOutsideFocusMode,
      run: (api) => {
        const result = splitFocusedTileInDirection(
          api.getState().tiles,
          api.getState().focusedTileId,
          directionalCommand.direction,
        );
        api.setTiles(() => result.tiles);
        api.setFocusedTileId(result.focusedTileId);
      },
    };
  }

  throw new Error(`Unknown command: ${commandId}`);
}

type DirectionalCommand =
  | { verb: "focus" | "resize"; direction: Direction }
  | { verb: "split"; direction: TileSplitDirection };

function parseDirectionalCommand(commandId: string): DirectionalCommand | null {
  const parts = commandId.split(".");
  const verb = parts[1];
  const direction = parts[2];
  if (parts[0] !== "tile") return null;
  if (verb === "focus" || verb === "resize") {
    if (!isDirection(direction)) return null;
    return { verb, direction };
  }
  if (verb === "split") {
    if (!isTileSplitDirection(direction)) return null;
    return { verb, direction };
  }
  return null;
}

function isDirection(value: string | undefined): value is Direction {
  return directions.some((direction) => direction === value);
}

function isTileSplitDirection(value: string | undefined): value is TileSplitDirection {
  return tileSplitDirections.some((direction) => direction === value);
}

function shortcutsForCommand(command: CommandManifestEntry): KeyboardShortcutBinding[] {
  return command.shortcuts ?? (command.shortcut ? [command.shortcut] : []);
}

function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcutBinding): boolean {
  return (
    eventKeyMatchesShortcut(event, shortcut.key) &&
    event.metaKey === Boolean(shortcut.meta) &&
    event.altKey === Boolean(shortcut.alt) &&
    event.ctrlKey === Boolean(shortcut.ctrl) &&
    event.shiftKey === Boolean(shortcut.shift)
  );
}

function eventKeyMatchesShortcut(event: KeyboardEvent, key: string): boolean {
  if (event.key.toLowerCase() === key) return true;
  return keyForKeyboardCode(event.code) === key;
}

function keyForKeyboardCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);

  const codeKeys: Record<string, string> = {
    ArrowDown: "arrowdown",
    ArrowLeft: "arrowleft",
    ArrowRight: "arrowright",
    ArrowUp: "arrowup",
    Backspace: "backspace",
    Comma: ",",
  };

  return codeKeys[code] ?? null;
}
