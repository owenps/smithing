import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { commandIdForKeyboardEvent, createCommands, type AppCommandApi } from "./commands";
import { KeyCap } from "./KeyCap";
import { Picker, type PickerItem } from "./Picker";
import { APP_NAME } from "./appConstants";
import { resetApplication } from "./applicationClient";
import { SettingsModal } from "./SettingsModal";
import { addProject, listProjects, removeProject } from "./projectClient";
import {
  clearAppSettings,
  createDefaultAppSettings,
  readAppSettings,
  writeAppSettings,
} from "./settings";
import { TerminalTile } from "./TerminalTile";
import { ToastStack, type AppToast, type ToastSeverity } from "./ToastStack";
import { createDefaultTiles, splitFocusedTile, type TileSplitDirection } from "./tileLayout";
import {
  findTilePickerItem,
  findTilePickerItemForTile,
  getTilePickerItems,
  type ConfigurableTilePickerItemId,
} from "./tilePickerCatalog";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  type CurrentWorkspaceResponse,
  type RegisteredProject,
  type TerminalLaunch,
  type Tile,
  type TileResumeMetadata,
  type WorkspaceContext,
  type WorkspaceTileState,
} from "./types";
import { getCurrentWorkspace, saveWorkspaceTileState } from "./workspaceClient";

interface LayoutState {
  tiles: Tile[];
  focusedTileId: string | null;
  focusModeTileId: string | null;
}

function createInitialLayout(): LayoutState {
  return createLayoutFromTiles(createDefaultTiles());
}

function createLayoutFromTileState(tileState: WorkspaceTileState): LayoutState {
  return createLayoutFromTiles(tileState.tiles.length > 0 ? tileState.tiles : createDefaultTiles());
}

function createLayoutFromTiles(tiles: Tile[]): LayoutState {
  return {
    tiles,
    focusedTileId: tiles[0]?.id ?? null,
    focusModeTileId: null,
  };
}

function terminalLaunchForTile(tile: Tile): TerminalLaunch {
  if (tile.kind === "tool") {
    return {
      kind: "tool",
      integrationId: tile.integrationId,
      integrationTileId: tile.integrationTileId,
      resume: tile.resume,
    };
  }

  return { kind: "shell" };
}

export function App() {
  const commands = useMemo(() => createCommands(), []);
  const commandById = useMemo(
    () => new Map(commands.map((command) => [command.id, command])),
    [commands],
  );
  const [layout, setLayout] = useState<LayoutState>(() => createInitialLayout());
  const [contextLoaded, setContextLoaded] = useState(false);
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string | null>(null);
  const [tilePickerOpen, setTilePickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [registeredProjects, setRegisteredProjects] = useState<RegisteredProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);
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
    void getCurrentWorkspace()
      .then((current) => {
        setContext(current?.context ?? null);
        setCurrentWorkspaceId(current?.workspaceId ?? null);
        if (current) {
          setLayout(createLayoutFromTileState(current.tileState));
        }
      })
      .catch(() => {
        setContext({
          project: { name: APP_NAME, root: "Unavailable outside Tauri", kind: "plain" },
          workspace: { id: "workspace-dev", name: "POC", root: "." },
          gitBranch: null,
        });
        setCurrentWorkspaceId(null);
      })
      .finally(() => setContextLoaded(true));
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((previous) => previous.filter((toast) => toast.id !== toastId));
  }, []);

  const addToast = useCallback(
    (toast: { severity: ToastSeverity; title: string; detail?: string }) => {
      const id = crypto.randomUUID();
      setToasts((previous) => previous.concat({ id, ...toast }));

      if (toast.severity !== "error") {
        window.setTimeout(() => dismissToast(id), 4000);
      }
    },
    [dismissToast],
  );

  const applyCurrentWorkspace = useCallback((current: CurrentWorkspaceResponse | null) => {
    setContext(current?.context ?? null);
    setCurrentWorkspaceId(current?.workspaceId ?? null);
    setContextLoaded(true);
    setLayout(current ? createLayoutFromTileState(current.tileState) : createInitialLayout());
  }, []);

  const refreshProjects = useCallback(() => {
    setProjectsLoaded(false);
    void listProjects()
      .then((projects) => {
        setRegisteredProjects(projects);
        setProjectsLoaded(true);
      })
      .catch((error) => {
        setProjectsLoaded(true);
        addToast({
          severity: "error",
          title: "Could not load projects",
          detail: String(error),
        });
      });
  }, [addToast]);

  const runAddProject = useCallback(() => {
    void addProject()
      .then((response) => {
        refreshProjects();
        if (!response.current) return;

        applyCurrentWorkspace(response.current);
        setTilePickerOpen(false);
        setSettingsOpen(false);
        addToast({
          severity: response.duplicate ? "info" : "success",
          title: response.duplicate ? "Project already registered" : "Project added",
          detail: response.current.context.workspace.root,
        });
      })
      .catch((error) => {
        addToast({
          severity: "error",
          title: "Could not add project",
          detail: String(error),
        });
      });
  }, [addToast, applyCurrentWorkspace, refreshProjects]);

  const runRemoveProject = useCallback(
    (projectId: string) => {
      void removeProject({ projectId })
        .then((response) => {
          setRegisteredProjects((previous) =>
            previous.filter((project) => project.id !== response.project.id),
          );
          applyCurrentWorkspace(response.current);
          addToast({
            severity: "success",
            title: "Project disconnected",
            detail: `${response.project.name} disconnected; ${response.removedWorkspaceCount} workspace${response.removedWorkspaceCount === 1 ? "" : "s"} closed.`,
          });
        })
        .catch((error) => {
          addToast({
            severity: "error",
            title: "Could not disconnect project",
            detail: String(error),
          });
        });
    },
    [addToast, applyCurrentWorkspace],
  );

  const resetClientState = useCallback(() => {
    clearAppSettings();
    setSettings(createDefaultAppSettings(import.meta.env.DEV));
    setContext(null);
    setCurrentWorkspaceId(null);
    setContextLoaded(true);
    setLayout(createInitialLayout());
    setRegisteredProjects([]);
    setProjectsLoaded(true);
    setTilePickerOpen(false);
    setSettingsOpen(false);
  }, []);

  const runResetApplication = useCallback(() => {
    void resetApplication()
      .then(() => {
        resetClientState();
        addToast({
          severity: "success",
          title: "You're back at the start",
          detail: `Choose a project to set up ${APP_NAME} again.`,
        });
      })
      .catch((error) => {
        addToast({
          severity: "error",
          title: `Could not finish resetting ${APP_NAME}`,
          detail: String(error),
        });
      });
  }, [addToast, resetClientState]);

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
      addProject: runAddProject,
    }),
    [runAddProject],
  );

  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    void listen("app://open-settings", () => setSettingsOpen(true))
      .then((unlistenSettingsEvent) => {
        unlistenFns.push(unlistenSettingsEvent);
      })
      .catch(() => {});

    void listen("app://add-project", runAddProject)
      .then((unlistenAddProjectEvent) => {
        unlistenFns.push(unlistenAddProjectEvent);
      })
      .catch(() => {});

    return () => unlistenFns.forEach((unlisten) => unlisten());
  }, [runAddProject]);

  useEffect(() => {
    if (!contextLoaded || !currentWorkspaceId) return;

    const saveTimer = window.setTimeout(() => {
      void saveWorkspaceTileState({
        workspaceId: currentWorkspaceId,
        tileState: { tiles: layout.tiles },
      }).catch(() => {});
    }, 400);

    return () => window.clearTimeout(saveTimer);
  }, [contextLoaded, currentWorkspaceId, layout.tiles]);

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
  const showGitBranch = Boolean(context?.gitBranch && context.gitBranch !== context.workspace.name);
  const projectName = context?.project.name ?? (contextLoaded ? "" : "Loading project");

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

  const createTile = (
    tileOptions:
      | { kind: "terminal"; title: string }
      | { kind: "tool"; title: string; integrationId: string; integrationTileId: string },
    splitDirection?: TileSplitDirection,
  ) => {
    const result = splitFocusedTile(
      layoutRef.current.tiles,
      layoutRef.current.focusedTileId,
      tileOptions,
      splitDirection,
    );
    setLayout((previous) => ({
      ...previous,
      tiles: result.tiles,
      focusedTileId: result.focusedTileId,
    }));
    setTilePickerOpen(false);
  };

  const assignTileResume = useCallback((tileId: string, resume: TileResumeMetadata) => {
    setLayout((previous) => {
      const tile = previous.tiles.find((candidate) => candidate.id === tileId);
      if (!tile || tile.kind !== "tool") return previous;
      if (
        tile.resume?.provider === resume.provider &&
        tile.resume.identifier === resume.identifier
      ) {
        return previous;
      }

      return {
        ...previous,
        tiles: previous.tiles.map((candidate) =>
          candidate.id === tileId && candidate.kind === "tool"
            ? { ...candidate, resume }
            : candidate,
        ),
      };
    });
  }, []);

  const tilePickerItems = useMemo<PickerItem[]>(
    () => getTilePickerItems(tilePickerVisibility),
    [tilePickerVisibility],
  );

  return (
    <main className="app-shell">
      <header className="top-bar" data-tauri-drag-region>
        <div className="traffic-light-spacer" data-tauri-drag-region />
        <div className="scope" data-tauri-drag-region>
          <span>{projectName}</span>
          {context ? (
            <>
              <span className="separator">/</span>
              <span>{context.workspace.name}</span>
            </>
          ) : null}
          {showGitBranch && context?.gitBranch ? (
            <span className="scope-branch" title={`Git branch: ${context.gitBranch}`}>
              <span className="scope-branch-icon" aria-hidden="true" />
              <span className="scope-branch-label">{context.gitBranch}</span>
            </span>
          ) : null}
        </div>
      </header>

      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <section className="workspace-shell" aria-label="Workspace">
        {!contextLoaded ? (
          <div className="empty-workspace-state">Loading project…</div>
        ) : context ? (
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
                    ) : debugLayout ? (
                      <span className="tile-meta">
                        {tile.x},{tile.y} {tile.w}×{tile.h}
                      </span>
                    ) : null}
                  </div>
                  <div className="tile-body">
                    {workspaceRoot ? (
                      <TerminalTile
                        tileId={tile.id}
                        cwd={workspaceRoot}
                        active={focused}
                        launch={terminalLaunchForTile(tile)}
                        terminalFontSize={terminalFontSize}
                        onResumeAssigned={(resume) => assignTileResume(tile.id, resume)}
                      />
                    ) : (
                      <div className="tile-placeholder">Loading workspace…</div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-workspace-state">
            <div className="empty-workspace-card">
              <h1>{APP_NAME}</h1>
              <p>Add a project root to start working.</p>
              <button className="primary-button" type="button" onClick={runAddProject}>
                Add Project…
              </button>
            </div>
          </div>
        )}
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
          projects={registeredProjects}
          projectsLoaded={projectsLoaded}
          currentProjectRoot={context?.project.root ?? null}
          onRefreshProjects={refreshProjects}
          onRemoveProject={runRemoveProject}
          onResetApplication={runResetApplication}
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
            createTile(
              catalogItem.kind === "tool"
                ? {
                    kind: "tool",
                    title: catalogItem.title,
                    integrationId: catalogItem.integrationId,
                    integrationTileId: catalogItem.integrationTileId,
                  }
                : { kind: "terminal", title: catalogItem.title },
              options.splitDirection,
            );
          }}
        />
      ) : null}
    </main>
  );
}
