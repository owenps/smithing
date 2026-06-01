import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { commandIdForKeyboardEvent, createCommands, type AppCommandApi } from "./commands";
import { KeyCap } from "./KeyCap";
import { Picker, type PickerItem } from "./Picker";
import { SettingsModal } from "./SettingsModal";
import { readAppSettings, writeAppSettings } from "./settings";
import { TerminalTile } from "./TerminalTile";
import { createDefaultTiles, splitFocusedTile, type TileSplitDirection } from "./tileLayout";
import {
  findTilePickerItem,
  findTilePickerItemForTile,
  getTilePickerItems,
  type ConfigurableTilePickerItemId,
} from "./tilePickerCatalog";
import { GRID_COLUMNS, GRID_ROWS, type Tile, type WorkspaceContext } from "./types";
import { getWorkspaceContext } from "./workspaceClient";

interface LayoutState {
  tiles: Tile[];
  focusedTileId: string | null;
  focusModeTileId: string | null;
}

function createInitialLayout(): LayoutState {
  const tiles = createDefaultTiles();
  return {
    tiles,
    focusedTileId: tiles[0]?.id ?? null,
    focusModeTileId: null,
  };
}

export function App() {
  const commands = useMemo(() => createCommands(), []);
  const commandById = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  const [layout, setLayout] = useState<LayoutState>(() => createInitialLayout());
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [tilePickerOpen, setTilePickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState(() => readAppSettings(import.meta.env.DEV));
  const { debugLayout, terminalFontSize, tileHeadersVisible, tilePickerVisibility } = settings;
  const layoutRef = useRef(layout);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    document.body.classList.toggle("debug-layout", debugLayout);
  }, [debugLayout]);

  useEffect(() => {
    writeAppSettings(settings);
  }, [settings]);

  useEffect(() => {
    void getWorkspaceContext()
      .then(setContext)
      .catch(() => {
        setContext({
          project: { name: "Smithing", root: "Unavailable outside Tauri" },
          workspace: { name: "POC", root: "." },
          gitBranch: null,
        });
      });
  }, []);

  const commandApi = useMemo<AppCommandApi>(
    () => ({
      getState: () => layoutRef.current,
      setTiles: (updater) => {
        setLayout((previous) => ({ ...previous, tiles: updater(previous.tiles) }));
      },
      setFocusedTileId: (tileId) => {
        setLayout((previous) => ({ ...previous, focusedTileId: tileId }));
      },
      setFocusModeTileId: (updater) => {
        setLayout((previous) => ({
          ...previous,
          focusModeTileId: updater(previous.focusModeTileId),
        }));
      },
      openTilePicker: () => setTilePickerOpen(true),
      openSettings: () => setSettingsOpen(true),
    }),
    [],
  );

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    void listen("app://open-settings", () => setSettingsOpen(true))
      .then((unlistenSettingsEvent) => {
        unlisten = unlistenSettingsEvent;
      })
      .catch(() => {});

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.metaKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        layoutRef.current.focusModeTileId &&
        !tilePickerOpen &&
        !settingsOpen
      ) {
        event.preventDefault();
        event.stopPropagation();
        commandApi.setFocusModeTileId(() => null);
        return;
      }

      const commandId = commandIdForKeyboardEvent(event);
      if (!commandId) return;

      event.preventDefault();
      event.stopPropagation();

      const command = commandById.get(commandId);
      if (!command || !command.canRun(layoutRef.current)) return;
      command.run(commandApi);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [commandApi, commandById, settingsOpen, tilePickerOpen]);

  const workspaceRoot = context?.workspace.root;

  const setDebugLayoutSetting = (debugLayout: boolean) => {
    setSettings((previous) => ({ ...previous, debugLayout }));
  };

  const setTerminalFontSizeSetting = (terminalFontSize: number) => {
    setSettings((previous) => ({ ...previous, terminalFontSize }));
  };

  const setTileHeadersVisibleSetting = (tileHeadersVisible: boolean) => {
    setSettings((previous) => ({ ...previous, tileHeadersVisible }));
  };

  const setTilePickerItemVisibility = (itemId: ConfigurableTilePickerItemId, visible: boolean) => {
    setSettings((previous) => ({
      ...previous,
      tilePickerVisibility: {
        ...previous.tilePickerVisibility,
        [itemId]: visible,
      },
    }));
  };

  const createTerminalTile = (
    title = "Terminal",
    initialCommand?: string,
    splitDirection?: TileSplitDirection,
  ) => {
    const result = splitFocusedTile(
      layoutRef.current.tiles,
      layoutRef.current.focusedTileId,
      {
        title,
        initialCommand,
      },
      splitDirection,
    );
    setLayout((previous) => ({
      ...previous,
      tiles: result.tiles,
      focusedTileId: result.focusedTileId,
    }));
    setTilePickerOpen(false);
  };

  const tilePickerItems = useMemo<PickerItem[]>(
    () => getTilePickerItems(tilePickerVisibility),
    [tilePickerVisibility],
  );

  return (
    <main className="app-shell">
      <header className="top-bar" data-tauri-drag-region>
        <div className="traffic-light-spacer" data-tauri-drag-region />
        <div className="scope" data-tauri-drag-region>
          <span>{context?.project.name ?? "Loading project"}</span>
          <span className="separator">/</span>
          <span>{context?.workspace.name ?? "Loading workspace"}</span>
          {context?.gitBranch ? (
            <span className="scope-branch" title={`Git branch: ${context.gitBranch}`}>
              <span className="scope-branch-icon" aria-hidden="true" />
              <span className="scope-branch-label">{context.gitBranch}</span>
            </span>
          ) : null}
        </div>
      </header>

      <section className="workspace-shell" aria-label="Workspace">
        <div
          className="workspace-grid"
          style={
            {
              "--grid-columns": GRID_COLUMNS,
              "--grid-rows": GRID_ROWS,
            } as CSSProperties
          }
        >
          {layout.tiles.map((tile) => {
            const focused = tile.id === layout.focusedTileId;
            const focusMode = tile.id === layout.focusModeTileId;
            const hiddenByFocusMode = Boolean(layout.focusModeTileId && !focusMode);
            const tilePickerItem = findTilePickerItemForTile(tile);

            return (
              <article
                key={tile.id}
                className={[
                  "tile",
                  focused ? "tile-focused" : "",
                  focusMode ? "tile-focus-mode" : "",
                  hiddenByFocusMode ? "tile-hidden-by-focus-mode" : "",
                  tileHeadersVisible ? "" : "tile-header-hidden",
                ].join(" ")}
                style={
                  {
                    "--tile-x": tile.x,
                    "--tile-y": tile.y,
                    "--tile-w": tile.w,
                    "--tile-h": tile.h,
                  } as CSSProperties
                }
                onMouseDown={() =>
                  setLayout((previous) => ({ ...previous, focusedTileId: tile.id }))
                }
              >
                <div className="tile-titlebar">
                  <span className="tile-title">
                    <span className="tile-title-icon" aria-hidden="true">
                      {tilePickerItem.icon}
                    </span>
                    <span className="tile-title-text">{tile.title}</span>
                  </span>
                  {focusMode ? (
                    <span className="tile-focus-badge">
                      Focus mode · <KeyCap size="compact">Esc</KeyCap>
                    </span>
                  ) : (
                    <span className="tile-meta">
                      {tile.x},{tile.y} {tile.w}×{tile.h}
                    </span>
                  )}
                </div>
                <div className="tile-body">
                  {workspaceRoot ? (
                    <TerminalTile
                      tileId={tile.id}
                      cwd={workspaceRoot}
                      active={focused}
                      initialCommand={tile.initialCommand}
                      terminalFontSize={terminalFontSize}
                    />
                  ) : (
                    <div className="tile-placeholder">Loading workspace…</div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {settingsOpen ? (
        <SettingsModal
          debugLayout={debugLayout}
          onDebugLayoutChange={setDebugLayoutSetting}
          terminalFontSize={terminalFontSize}
          onTerminalFontSizeChange={setTerminalFontSizeSetting}
          tileHeadersVisible={tileHeadersVisible}
          onTileHeadersVisibleChange={setTileHeadersVisibleSetting}
          tilePickerVisibility={tilePickerVisibility}
          onTilePickerVisibilityChange={setTilePickerItemVisibility}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {tilePickerOpen ? (
        <Picker
          title="New Tile"
          items={tilePickerItems}
          onClose={() => setTilePickerOpen(false)}
          onSelect={(item: PickerItem, options) => {
            const catalogItem = findTilePickerItem(item.id);
            if (!catalogItem) return;
            createTerminalTile(
              catalogItem.title,
              catalogItem.initialCommand,
              options.splitDirection,
            );
          }}
        />
      ) : null}
    </main>
  );
}
