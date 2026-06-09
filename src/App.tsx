import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  CodeEditorTile,
  type CodeEditorController,
  type CodeEditorOpenFileRequest,
} from "./CodeEditorTile";
import {
  applyThemeToDocument,
  onSystemThemeChange,
  resolvedThemeId as resolveThemeId,
  type ThemeId,
} from "./themeRegistry";
import { commandIdForKeyboardEvent, createCommands, type AppCommandApi } from "./commands";
import { DiffTile } from "./DiffTile";
import { fileIconForPath } from "./fileIcons";
import { Picker, PickerShortcutHint, PickerShortcutSeparator, type PickerItem } from "./Picker";
import { APP_NAME } from "./appConstants";
import { resetApplication } from "./applicationClient";
import { SettingsView } from "./SettingsView";
import {
  listExtensionSettings,
  listIntegrationCatalog,
  listToolAvailabilities,
} from "./integrationClient";
import { addProject, listProjects, removeProject } from "./projectClient";
import { indexProjectFiles } from "./projectFileClient";
import {
  createDefaultAppSettings,
  normalizeCodeEditorSettings,
  type AppSettings,
} from "./settings";
import { getAppSettings, updateAppSettings, updateProjectSettings } from "./settingsClient";
import { TerminalTile } from "./TerminalTile";
import {
  closeAllTerminalSessionRuntimes,
  closeTerminalSessionRuntime,
  closeTerminalSessionRuntimesExceptWorkspaceIds,
  closeTerminalSessionRuntimesForWorkspace,
} from "./terminalSessionRuntime";
import { ToastStack, type AppToast, type ToastSeverity } from "./ToastStack";
import { WorkspaceTile } from "./WorkspaceTile";
import {
  closeTile,
  createDefaultTiles,
  splitFocusedTile,
  type TileSplitDirection,
} from "./tileLayout";
import {
  createConfigurableTilePickerItems,
  defaultConfigurableTilePickerItems,
  findTilePickerItem,
  findTilePickerItemForTile,
  getTilePickerItems,
  integrationTilePickerItemId,
  type ConfigurableTilePickerCatalogItem,
  type ConfigurableTilePickerItemId,
  type TilePickerCatalogItem,
} from "./tilePickerCatalog";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  type CurrentWorkspaceResponse,
  type DirtyConfirmation,
  type ExtensionSettingsResponse,
  type OpenWorkspaceSummary,
  type ProjectSettings,
  type RegisteredProject,
  type TerminalLaunch,
  type Tile,
  type TileResumeMetadata,
  type ToolAvailability,
  type WorkspaceContext,
  type WorkspaceTileState,
} from "./types";
import {
  createWorkspace,
  discardWorkspace,
  getWorkspaceOverview,
  saveWorkspaceTileState,
  switchWorkspace,
} from "./workspaceClient";

interface LayoutState {
  tiles: Tile[];
  focusedTileId: string | null;
  focusModeTileId: string | null;
}

type DirtyDisposition = "save" | "discard" | "cancel";

interface DirtyEditorPrompt {
  title: string;
  message: string;
  saveLabel?: string;
  discardLabel?: string;
  cancelLabel?: string;
  resolve: (disposition: DirtyDisposition) => void;
}

type RecentProjectFilesByWorkspace = Record<string, string[]>;

const maxRecentProjectFiles = 10;
const recentProjectFilesStorageKey = "fluidity.recentProjectFilesByWorkspace";

function loadRecentProjectFilesByWorkspace(): RecentProjectFilesByWorkspace {
  try {
    const value = window.localStorage.getItem(recentProjectFilesStorageKey);
    const parsed = value ? JSON.parse(value) : null;
    if (!parsed || typeof parsed !== "object") return {};

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          (entry): entry is [string, string[]] =>
            Array.isArray(entry[1]) && entry[1].every((path) => typeof path === "string"),
        )
        .map(([workspaceId, paths]) => [workspaceId, paths.slice(0, maxRecentProjectFiles)]),
    );
  } catch {
    return {};
  }
}

function storeRecentProjectFilesByWorkspace(filesByWorkspace: RecentProjectFilesByWorkspace) {
  try {
    window.localStorage.setItem(recentProjectFilesStorageKey, JSON.stringify(filesByWorkspace));
  } catch {
    // Ignore storage failures.
  }
}

function createInitialLayout(): LayoutState {
  return createLayoutFromTiles(createDefaultTiles());
}

function createLayoutFromTileState(tileState: WorkspaceTileState): LayoutState {
  return createLayoutFromTiles(tileState.tiles.length > 0 ? tileState.tiles : createDefaultTiles());
}

function workspaceShortcutIndexForKeyboardEvent(event: KeyboardEvent): number | null {
  if (!event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return null;

  const digit = /^[1-9]$/.test(event.key)
    ? event.key
    : (/^(?:Digit|Numpad)([1-9])$/.exec(event.code)?.[1] ?? null);

  return digit ? Number(digit) - 1 : null;
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
      extensionId: tile.extensionId,
      integrationId: tile.integrationId,
      integrationTileId: tile.integrationTileId,
      resume: tile.resume,
    };
  }

  return { kind: "shell" };
}

function toolTileResolves(tile: Tile, catalogItems: ConfigurableTilePickerCatalogItem[]): boolean {
  if (tile.kind !== "tool") return true;
  return catalogItems.some(
    (item) =>
      item.kind === "tool" &&
      item.extensionId === tile.extensionId &&
      item.integrationId === tile.integrationId &&
      item.integrationTileId === tile.integrationTileId,
  );
}

function integrationTileIdentity(tile: Tile): string {
  if (tile.kind !== "tool") return tile.kind;
  return `${tile.extensionId}:${tile.integrationId}.${tile.integrationTileId}`;
}

function startWindowDrag(event: ReactMouseEvent<HTMLElement>) {
  if (event.button !== 0) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("button,a,input,textarea,select,[role='button']")) return;

  try {
    void getCurrentWindow()
      .startDragging()
      .catch(() => undefined);
  } catch {
    // No-op outside Tauri.
  }
}

function UnavailableIntegrationTile({ tile }: { tile: Tile }) {
  return (
    <div className="tile-unavailable" role="status">
      <strong>Integration Tile unavailable.</strong>
      <span>
        Fluidity could not find <code>{integrationTileIdentity(tile)}</code> for this Workspace.
      </span>
      <span>Restore the Extension Definition or run Reload Extensions after fixing it.</span>
    </div>
  );
}

function tileOptionsForCatalogItem(catalogItem: TilePickerCatalogItem):
  | { kind: "terminal"; title: string }
  | { kind: "workspace"; title: string }
  | { kind: "code"; title: string }
  | { kind: "diff"; title: string }
  | {
      kind: "tool";
      title: string;
      extensionId: string;
      integrationId: string;
      integrationTileId: string;
    } {
  if (catalogItem.kind === "tool") {
    return {
      kind: "tool",
      title: catalogItem.title,
      extensionId: catalogItem.extensionId,
      integrationId: catalogItem.integrationId,
      integrationTileId: catalogItem.integrationTileId,
    };
  }

  if (catalogItem.kind === "workspace") {
    return { kind: "workspace", title: catalogItem.title };
  }

  if (catalogItem.kind === "code") {
    return { kind: "code", title: catalogItem.title };
  }

  if (catalogItem.kind === "diff") {
    return { kind: "diff", title: catalogItem.title };
  }

  return { kind: "terminal", title: catalogItem.title };
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
  const [currentWorkspaceDiscardable, setCurrentWorkspaceDiscardable] = useState(false);
  const [tilePickerOpen, setTilePickerOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [projectSearchOpen, setProjectSearchOpen] = useState(false);
  const [projectFileItems, setProjectFileItems] = useState<PickerItem[]>([]);
  const [recentProjectFilesByWorkspace, setRecentProjectFilesByWorkspace] =
    useState<RecentProjectFilesByWorkspace>(() => loadRecentProjectFilesByWorkspace());
  const [projectFileIndexLoading, setProjectFileIndexLoading] = useState(false);
  const [codeEditorOpenFileRequests, setCodeEditorOpenFileRequests] = useState<
    Record<string, CodeEditorOpenFileRequest>
  >({});
  const [dirtyCodeEditorTileIds, setDirtyCodeEditorTileIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [diffRefreshToken, setDiffRefreshToken] = useState(0);
  const [dirtyEditorPrompt, setDirtyEditorPrompt] = useState<DirtyEditorPrompt | null>(null);
  const [settingsViewOpen, setSettingsViewOpen] = useState(false);
  const [settingsViewFocusToken, setSettingsViewFocusToken] = useState(0);
  const [settingsViewInitialCategory, setSettingsViewInitialCategory] = useState<
    "extensions" | null
  >(null);
  const [openWorkspaces, setOpenWorkspaces] = useState<OpenWorkspaceSummary[]>([]);
  const [layoutMutationPreview, setLayoutMutationPreview] = useState(false);
  const [registeredProjects, setRegisteredProjects] = useState<RegisteredProject[]>([]);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [toasts, setToasts] = useState<AppToast[]>([]);
  const [configurableTilePickerItems, setConfigurableTilePickerItems] = useState<
    ConfigurableTilePickerCatalogItem[]
  >(defaultConfigurableTilePickerItems);
  const [integrationCatalogLoaded, setIntegrationCatalogLoaded] = useState(false);
  const [toolAvailabilities, setToolAvailabilities] = useState<ToolAvailability[]>([]);
  const [toolAvailabilityLoaded, setToolAvailabilityLoaded] = useState(false);
  const [extensionSettings, setExtensionSettings] = useState<ExtensionSettingsResponse | null>(
    null,
  );
  const [extensionSettingsLoaded, setExtensionSettingsLoaded] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => createDefaultAppSettings());
  const {
    debugLayout,
    tileSettings,
    themeId,
    tileHeadersVisible,
    diffColorPolarity,
    workspaceBranchPrefix,
    tilePickerVisibility,
  } = settings;
  const layoutRef = useRef(layout);
  const codeEditorControllersRef = useRef(new Map<string, CodeEditorController>());
  const dirtyCodeEditorTileIdsRef = useRef(new Set<string>());
  const lastFocusedCodeTileIdRef = useRef<string | null>(null);
  const previousTileRuntimeOwnersRef = useRef<{ workspaceId: string | null; tileIds: Set<string> }>(
    { workspaceId: null, tileIds: new Set() },
  );
  const [resolvedThemeId, setResolvedThemeId] = useState(() => resolveThemeId(themeId));

  useEffect(() => {
    const applyTheme = () => {
      applyThemeToDocument(themeId);
      setResolvedThemeId(resolveThemeId(themeId));
    };
    applyTheme();
    return onSystemThemeChange(applyTheme);
  }, [themeId]);

  useEffect(() => {
    layoutRef.current = layout;
    const focusedTile = layout.tiles.find((tile) => tile.id === layout.focusedTileId);
    if (focusedTile?.kind === "code") lastFocusedCodeTileIdRef.current = focusedTile.id;
    if (
      lastFocusedCodeTileIdRef.current &&
      !layout.tiles.some(
        (tile) => tile.id === lastFocusedCodeTileIdRef.current && tile.kind === "code",
      )
    ) {
      lastFocusedCodeTileIdRef.current = null;
    }
    const codeTileIds = new Set(
      layout.tiles.filter((tile) => tile.kind === "code").map((tile) => tile.id),
    );
    setCodeEditorOpenFileRequests((previous) => {
      const nextEntries = Object.entries(previous).filter(([tileId]) => codeTileIds.has(tileId));
      if (nextEntries.length === Object.keys(previous).length) return previous;
      return Object.fromEntries(nextEntries);
    });
    setDirtyCodeEditorTileIds((previous) => {
      const next = new Set([...previous].filter((tileId) => codeTileIds.has(tileId)));
      dirtyCodeEditorTileIdsRef.current = next;
      return next.size === previous.size ? previous : next;
    });
  }, [layout]);

  useEffect(() => {
    const nextTileRuntimeOwners = {
      workspaceId: currentWorkspaceId,
      tileIds: new Set(layout.tiles.map((tile) => tile.id)),
    };
    const previousTileRuntimeOwners = previousTileRuntimeOwnersRef.current;

    if (currentWorkspaceId && previousTileRuntimeOwners.workspaceId === currentWorkspaceId) {
      previousTileRuntimeOwners.tileIds.forEach((tileId) => {
        if (!nextTileRuntimeOwners.tileIds.has(tileId)) {
          closeTerminalSessionRuntime(currentWorkspaceId, tileId);
        }
      });
    }

    previousTileRuntimeOwnersRef.current = nextTileRuntimeOwners;
  }, [currentWorkspaceId, layout.tiles]);

  useEffect(() => {
    document.body.classList.toggle("debug-layout", debugLayout);
  }, [debugLayout]);

  useEffect(() => {
    const setModifierPreview = (active: boolean) => {
      setLayoutMutationPreview((previous) => (previous === active ? previous : active));
    };

    const onKeyDown = (event: KeyboardEvent) => {
      setModifierPreview(event.ctrlKey && event.altKey);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      setModifierPreview(event.ctrlKey && event.altKey);
    };

    const onBlur = () => {
      setModifierPreview(false);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    void getAppSettings()
      .then(setSettings)
      .catch(() => {});
  }, []);

  useEffect(() => {
    void getWorkspaceOverview()
      .then((overview) => {
        const current = overview.current;
        setContext(current?.context ?? null);
        setCurrentWorkspaceId(current?.workspaceId ?? null);
        setCurrentWorkspaceDiscardable(current?.context.workspace.discardable ?? false);
        setOpenWorkspaces(overview.openWorkspaces);
        if (current) {
          setLayout(createLayoutFromTileState(current.tileState));
        }
      })
      .catch(() => {
        setContext({
          project: { name: APP_NAME, root: "Unavailable outside Tauri", kind: "plain" },
          workspace: { id: "workspace-dev", name: "POC", root: ".", discardable: false },
          gitBranch: null,
        });
        setCurrentWorkspaceId(null);
        setCurrentWorkspaceDiscardable(false);
        setOpenWorkspaces([]);
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

  const addWarningToasts = useCallback(
    (warnings: string[]) => {
      warnings.forEach((warning) => {
        addToast({ severity: "info", title: "Workspace warning", detail: warning });
      });
    },
    [addToast],
  );

  const requestDirtyEditorDisposition = useCallback(
    (options: {
      title: string;
      message: string;
      saveLabel?: string;
      discardLabel?: string;
      cancelLabel?: string;
    }) =>
      new Promise<DirtyDisposition>((resolve) => {
        setDirtyEditorPrompt({ ...options, resolve });
      }),
    [],
  );

  const resolveDirtyEditorPrompt = (disposition: DirtyDisposition) => {
    setDirtyEditorPrompt((prompt) => {
      prompt?.resolve(disposition);
      return null;
    });
  };

  const setCodeEditorDirtyState = useCallback((tileId: string, dirty: boolean) => {
    setDirtyCodeEditorTileIds((previous) => {
      const next = new Set(previous);
      if (dirty) next.add(tileId);
      else next.delete(tileId);
      dirtyCodeEditorTileIdsRef.current = next;
      return next;
    });
  }, []);

  const registerCodeEditorController = useCallback(
    (tileId: string, controller: CodeEditorController | null) => {
      if (controller) codeEditorControllersRef.current.set(tileId, controller);
      else codeEditorControllersRef.current.delete(tileId);
    },
    [],
  );

  const guardDirtyCodeEditors = useCallback(
    async (tileIds: string[], title: string, message: string) => {
      const dirtyTileIds = tileIds.filter((tileId) =>
        codeEditorControllersRef.current.get(tileId)?.hasDirty(),
      );
      if (!dirtyTileIds.length) return true;

      const disposition = await requestDirtyEditorDisposition({ title, message });
      if (disposition === "cancel") return false;
      if (disposition === "discard") {
        dirtyTileIds.forEach((tileId) =>
          codeEditorControllersRef.current.get(tileId)?.discardAll(),
        );
        return true;
      }

      for (const tileId of dirtyTileIds) {
        const saved = await codeEditorControllersRef.current.get(tileId)?.saveAll();
        if (!saved) return false;
      }
      return true;
    },
    [requestDirtyEditorDisposition],
  );

  const confirmDirtyDeletion = useCallback((confirmation: DirtyConfirmation) => {
    const sample = confirmation.samplePaths.length
      ? `\n\nChanged files:\n${confirmation.samplePaths.map((path) => `• ${path}`).join("\n")}`
      : "";
    return window.confirm(
      `${confirmation.message}\n\n${confirmation.dirtyWorkspaceCount} dirty workspace${confirmation.dirtyWorkspaceCount === 1 ? "" : "s"}; ${confirmation.changedFileCount} changed file${confirmation.changedFileCount === 1 ? "" : "s"}.${sample}\n\nDiscard these changes?`,
    );
  }, []);

  const applyCurrentWorkspace = useCallback((current: CurrentWorkspaceResponse | null) => {
    setContext(current?.context ?? null);
    setCurrentWorkspaceId(current?.workspaceId ?? null);
    setCurrentWorkspaceDiscardable(current?.context.workspace.discardable ?? false);
    setContextLoaded(true);
    setLayout(current ? createLayoutFromTileState(current.tileState) : createInitialLayout());
  }, []);

  const applyWorkspaceOverview = useCallback(
    (overview: {
      current: CurrentWorkspaceResponse | null;
      openWorkspaces: OpenWorkspaceSummary[];
    }) => {
      setOpenWorkspaces(overview.openWorkspaces);
      applyCurrentWorkspace(overview.current);
    },
    [applyCurrentWorkspace],
  );

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

  useEffect(() => {
    refreshProjects();
  }, [refreshProjects]);

  const refreshIntegrationCatalog = useCallback(() => {
    setIntegrationCatalogLoaded(false);
    return listIntegrationCatalog({ workspaceId: currentWorkspaceId })
      .then((catalog) => {
        setConfigurableTilePickerItems(createConfigurableTilePickerItems(catalog.tiles));
        setIntegrationCatalogLoaded(true);
        catalog.diagnostics.forEach((diagnostic) => {
          addToast({
            severity: diagnostic.severity === "error" ? "error" : "info",
            title: "Extension warning",
            detail: diagnostic.message,
          });
        });
      })
      .catch(() => {
        setConfigurableTilePickerItems(defaultConfigurableTilePickerItems);
        setIntegrationCatalogLoaded(true);
      });
  }, [addToast, currentWorkspaceId]);

  const refreshToolAvailabilities = useCallback(() => {
    setToolAvailabilityLoaded(false);
    return listToolAvailabilities({ workspaceId: currentWorkspaceId })
      .then((availabilities) => {
        setToolAvailabilities(availabilities);
        setToolAvailabilityLoaded(true);
      })
      .catch(() => {
        setToolAvailabilities([]);
        setToolAvailabilityLoaded(true);
      });
  }, [currentWorkspaceId]);

  const refreshExtensionSettings = useCallback(() => {
    setExtensionSettingsLoaded(false);
    return listExtensionSettings({ workspaceId: currentWorkspaceId })
      .then((settings) => {
        setExtensionSettings(settings);
        setExtensionSettingsLoaded(true);
      })
      .catch(() => {
        setExtensionSettings({ extensions: [], diagnostics: [] });
        setExtensionSettingsLoaded(true);
      });
  }, [currentWorkspaceId]);

  useEffect(() => {
    void refreshIntegrationCatalog();
    void refreshToolAvailabilities();
    void refreshExtensionSettings();
  }, [refreshExtensionSettings, refreshIntegrationCatalog, refreshToolAvailabilities]);

  useEffect(() => {
    if (tilePickerOpen || settingsViewOpen) {
      void refreshToolAvailabilities();
    }
    if (settingsViewOpen) {
      void refreshExtensionSettings();
    }
  }, [refreshExtensionSettings, refreshToolAvailabilities, settingsViewOpen, tilePickerOpen]);

  const toolAvailabilityByPickerItemId = useMemo(
    () =>
      new Map(
        toolAvailabilities.map((availability) => [
          integrationTilePickerItemId(
            availability.extensionId,
            availability.integrationId,
            availability.integrationTileId,
          ),
          availability,
        ]),
      ),
    [toolAvailabilities],
  );

  const runAddProject = useCallback(() => {
    const add = async () => {
      const codeTileIds = layoutRef.current.tiles
        .filter((tile) => tile.kind === "code")
        .map((tile) => tile.id);
      const canAdd = await guardDirtyCodeEditors(
        codeTileIds,
        "Add project?",
        "Code editors have unsaved changes.",
      );
      if (!canAdd) return null;
      return addProject();
    };

    void add()
      .then((response) => {
        if (!response) return;
        refreshProjects();
        if (!response.overview.current) return;

        applyWorkspaceOverview(response.overview);
        setTilePickerOpen(false);
        setWorkspacePickerOpen(false);
        setSettingsViewOpen(false);
        addWarningToasts(response.warnings);
        addToast({
          severity: response.duplicate ? "info" : "success",
          title: response.duplicate ? "Project already registered" : "Project added",
          detail: response.overview.current.context.workspace.root,
        });
      })
      .catch((error) => {
        addToast({
          severity: "error",
          title: "Could not add project",
          detail: String(error),
        });
      });
  }, [addToast, addWarningToasts, applyWorkspaceOverview, guardDirtyCodeEditors, refreshProjects]);

  const runCreateWorkspace = useCallback(
    (projectId: string) => {
      const create = async () => {
        const codeTileIds = layoutRef.current.tiles
          .filter((tile) => tile.kind === "code")
          .map((tile) => tile.id);
        const canCreate = await guardDirtyCodeEditors(
          codeTileIds,
          "Create workspace?",
          "Code editors have unsaved changes.",
        );
        if (!canCreate) return null;
        return createWorkspace({ projectId });
      };

      void create()
        .then((response) => {
          if (!response) return;
          applyWorkspaceOverview(response.overview);
          setWorkspacePickerOpen(false);
          setTilePickerOpen(false);
          setSettingsViewOpen(false);
          addWarningToasts(response.warnings);
        })
        .catch((error) => {
          addToast({
            severity: "error",
            title: "Could not create workspace",
            detail: String(error),
          });
        });
    },
    [addToast, addWarningToasts, applyWorkspaceOverview, guardDirtyCodeEditors],
  );

  const runRemoveProject = useCallback(
    (projectId: string) => {
      const finishRemoval = (confirmDirty: boolean) => {
        const remove = async () => {
          const removesCurrentWorkspace = openWorkspaces.some(
            (workspace) => workspace.id === currentWorkspaceId && workspace.projectId === projectId,
          );
          if (removesCurrentWorkspace) {
            const codeTileIds = layoutRef.current.tiles
              .filter((tile) => tile.kind === "code")
              .map((tile) => tile.id);
            const canRemove = await guardDirtyCodeEditors(
              codeTileIds,
              "Disconnect project?",
              "Code editors have unsaved changes.",
            );
            if (!canRemove) return null;
          }
          return removeProject({ projectId, confirmDirty });
        };

        void remove()
          .then((response) => {
            if (!response) return;
            if (response.dirtyConfirmation) {
              if (confirmDirtyDeletion(response.dirtyConfirmation)) {
                finishRemoval(true);
              }
              return;
            }
            setRegisteredProjects((previous) =>
              previous.filter((project) => project.id !== response.project.id),
            );
            closeTerminalSessionRuntimesExceptWorkspaceIds(
              new Set(response.overview.openWorkspaces.map((workspace) => workspace.id)),
            );
            applyWorkspaceOverview(response.overview);
            addWarningToasts(response.warnings);
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
      };

      finishRemoval(false);
    },
    [
      addToast,
      addWarningToasts,
      applyWorkspaceOverview,
      confirmDirtyDeletion,
      currentWorkspaceId,
      guardDirtyCodeEditors,
      openWorkspaces,
    ],
  );

  const resetClientState = useCallback(() => {
    setSettings(createDefaultAppSettings());
    setContext(null);
    setCurrentWorkspaceId(null);
    setCurrentWorkspaceDiscardable(false);
    setContextLoaded(true);
    setLayout(createInitialLayout());
    setRegisteredProjects([]);
    setOpenWorkspaces([]);
    setProjectsLoaded(true);
    setTilePickerOpen(false);
    setWorkspacePickerOpen(false);
    setProjectSearchOpen(false);
    setSettingsViewOpen(false);
    setSettingsViewInitialCategory(null);
    setRecentProjectFilesByWorkspace({});
    storeRecentProjectFilesByWorkspace({});
  }, []);

  const runResetApplication = useCallback(() => {
    const finishReset = (confirmDirty: boolean) => {
      const reset = async () => {
        const codeTileIds = layoutRef.current.tiles
          .filter((tile) => tile.kind === "code")
          .map((tile) => tile.id);
        const canReset = await guardDirtyCodeEditors(
          codeTileIds,
          "Reset application?",
          "Code editors have unsaved changes.",
        );
        if (!canReset) return null;
        return resetApplication({ confirmDirty });
      };

      void reset()
        .then((response) => {
          if (!response) return;
          if (response.dirtyConfirmation) {
            if (confirmDirtyDeletion(response.dirtyConfirmation)) {
              finishReset(true);
            }
            return;
          }
          addWarningToasts(response.warnings);
          closeAllTerminalSessionRuntimes();
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
    };

    finishReset(false);
  }, [addToast, addWarningToasts, confirmDirtyDeletion, guardDirtyCodeEditors, resetClientState]);

  const runSwitchWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === currentWorkspaceId) return;

      const switchCurrentWorkspace = async () => {
        const codeTileIds = layoutRef.current.tiles
          .filter((tile) => tile.kind === "code")
          .map((tile) => tile.id);
        const canSwitch = await guardDirtyCodeEditors(
          codeTileIds,
          "Switch workspace?",
          "Code editors have unsaved changes.",
        );
        if (!canSwitch) return;

        const saveCurrentLayout = currentWorkspaceId
          ? saveWorkspaceTileState({
              workspaceId: currentWorkspaceId,
              tileState: { tiles: layoutRef.current.tiles },
            }).catch(() => {})
          : Promise.resolve();

        return saveCurrentLayout
          .then(() => switchWorkspace({ workspaceId }))
          .then((response) => {
            applyWorkspaceOverview(response.overview);
          })
          .catch((error) => {
            addToast({
              severity: "error",
              title: "Could not switch workspace",
              detail: String(error),
            });
          });
      };

      void switchCurrentWorkspace();
    },
    [addToast, applyWorkspaceOverview, currentWorkspaceId, guardDirtyCodeEditors],
  );

  const runDiscardWorkspace = useCallback(
    (workspaceId: string) => {
      const finishDiscard = (confirmDirty: boolean) => {
        const discard = async () => {
          if (workspaceId === currentWorkspaceId) {
            const codeTileIds = layoutRef.current.tiles
              .filter((tile) => tile.kind === "code")
              .map((tile) => tile.id);
            const canDiscard = await guardDirtyCodeEditors(
              codeTileIds,
              "Discard workspace?",
              "Code editors have unsaved changes.",
            );
            if (!canDiscard) return null;
          }
          return discardWorkspace({ workspaceId, confirmDirty });
        };

        void discard()
          .then((response) => {
            if (!response) return;
            if (response.dirtyConfirmation) {
              if (confirmDirtyDeletion(response.dirtyConfirmation)) {
                finishDiscard(true);
              }
              return;
            }

            closeTerminalSessionRuntimesForWorkspace(workspaceId);
            applyWorkspaceOverview(response.overview);
            addWarningToasts(response.warnings);
            addToast({
              severity: "success",
              title: "Workspace discarded",
              detail: response.overview.current
                ? `Now showing ${response.overview.current.context.workspace.name}.`
                : "No workspaces are open.",
            });
          })
          .catch((error) => {
            addToast({
              severity: "error",
              title: "Could not discard workspace",
              detail: String(error),
            });
          });
      };

      finishDiscard(false);
    },
    [
      addToast,
      addWarningToasts,
      applyWorkspaceOverview,
      confirmDirtyDeletion,
      currentWorkspaceId,
      guardDirtyCodeEditors,
    ],
  );

  const runDiscardCurrentWorkspace = useCallback(() => {
    if (!currentWorkspaceId || !currentWorkspaceDiscardable) return;
    runDiscardWorkspace(currentWorkspaceId);
  }, [currentWorkspaceDiscardable, currentWorkspaceId, runDiscardWorkspace]);

  const loadProjectFileIndex = useCallback(() => {
    if (!currentWorkspaceId) {
      setProjectFileItems([]);
      return;
    }

    setProjectFileIndexLoading(true);
    void indexProjectFiles({ workspaceId: currentWorkspaceId })
      .then((index) => {
        setProjectFileItems(
          index.files.map((file) => ({
            id: file.path,
            title: file.path,
            icon: fileIconForPath(file.path),
            searchText: file.path,
          })),
        );
      })
      .catch((error) => {
        setProjectFileItems([]);
        addToast({
          severity: "error",
          title: "Could not index project files",
          detail: String(error),
        });
      })
      .finally(() => setProjectFileIndexLoading(false));
  }, [addToast, currentWorkspaceId]);

  const openProjectSearch = useCallback(() => {
    if (!currentWorkspaceId) {
      addToast({ severity: "info", title: "Open a workspace before searching files" });
      return;
    }
    setProjectSearchOpen(true);
    setTilePickerOpen(false);
    setWorkspacePickerOpen(false);
    setSettingsViewOpen(false);
    loadProjectFileIndex();
  }, [addToast, currentWorkspaceId, loadProjectFileIndex]);

  const recordRecentProjectFile = useCallback((workspaceId: string | null, path: string) => {
    if (!workspaceId) return;

    setRecentProjectFilesByWorkspace((previous) => {
      const previousPaths = previous[workspaceId] ?? [];
      const nextPaths = [
        path,
        ...previousPaths.filter((candidatePath) => candidatePath !== path),
      ].slice(0, maxRecentProjectFiles);
      if (nextPaths.join("\0") === previousPaths.join("\0")) return previous;

      const next = { ...previous, [workspaceId]: nextPaths };
      storeRecentProjectFilesByWorkspace(next);
      return next;
    });
  }, []);

  const recordCurrentWorkspaceFileVisit = useCallback(
    (path: string) => recordRecentProjectFile(currentWorkspaceId, path),
    [currentWorkspaceId, recordRecentProjectFile],
  );

  const openSettingsView = useCallback((category?: "extensions") => {
    setSettingsViewInitialCategory(category ?? null);
    setSettingsViewOpen(true);
    setSettingsViewFocusToken((token) => token + 1);
    setTilePickerOpen(false);
    setWorkspacePickerOpen(false);
    setProjectSearchOpen(false);
  }, []);

  const reloadExtensions = useCallback(() => {
    void Promise.all([
      refreshIntegrationCatalog(),
      refreshToolAvailabilities(),
      refreshExtensionSettings(),
    ]).then(() => {
      addToast({ severity: "success", title: "Extensions reloaded" });
    });
  }, [addToast, refreshExtensionSettings, refreshIntegrationCatalog, refreshToolAvailabilities]);

  const closeFocusedTileGuarded = useCallback(() => {
    const closingTileId = layoutRef.current.focusedTileId;
    if (!closingTileId) return;
    const closeFocused = async () => {
      const closingTile = layoutRef.current.tiles.find((tile) => tile.id === closingTileId);
      if (closingTile?.kind === "code") {
        const canClose = await guardDirtyCodeEditors(
          [closingTileId],
          "Close dirty editor?",
          "This editor has unsaved changes.",
        );
        if (!canClose) return;
      }
      const result = closeTile(layoutRef.current.tiles, closingTileId);
      setLayout((previous) => ({
        ...previous,
        tiles: result.tiles,
        focusedTileId: result.focusedTileId,
        focusModeTileId:
          previous.focusModeTileId === closingTileId ? null : previous.focusModeTileId,
      }));
    };
    void closeFocused();
  }, [guardDirtyCodeEditors]);

  const closeFocusedItem = useCallback(() => {
    const focusedTileId = layoutRef.current.focusedTileId;
    const focusedTile = layoutRef.current.tiles.find((tile) => tile.id === focusedTileId);
    if (!focusedTileId || !focusedTile) return;
    if (focusedTile.kind !== "code") {
      closeFocusedTileGuarded();
      return;
    }

    const closeCodeItem = async () => {
      const closedTab = await codeEditorControllersRef.current.get(focusedTileId)?.closeActiveTab();
      if (!closedTab) closeFocusedTileGuarded();
    };
    void closeCodeItem();
  }, [closeFocusedTileGuarded]);

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
      openWorkspacePicker: () => setWorkspacePickerOpen(true),
      openProjectSearch,
      openSettings: openSettingsView,
      reloadExtensions,
      addProject: runAddProject,
      discardWorkspace: runDiscardCurrentWorkspace,
      closeFocusedTile: closeFocusedTileGuarded,
      closeFocusedItem,
    }),
    [
      closeFocusedItem,
      closeFocusedTileGuarded,
      openProjectSearch,
      openSettingsView,
      reloadExtensions,
      runAddProject,
      runDiscardCurrentWorkspace,
    ],
  );

  useEffect(() => {
    const unlistenFns: UnlistenFn[] = [];

    void listen("app://open-settings", () => openSettingsView())
      .then((unlistenSettingsEvent) => {
        unlistenFns.push(unlistenSettingsEvent);
      })
      .catch(() => {});

    void listen("app://open-extensions", () => openSettingsView("extensions"))
      .then((unlistenOpenExtensionsEvent) => {
        unlistenFns.push(unlistenOpenExtensionsEvent);
      })
      .catch(() => {});

    void listen("app://reload-extensions", reloadExtensions)
      .then((unlistenReloadExtensionsEvent) => {
        unlistenFns.push(unlistenReloadExtensionsEvent);
      })
      .catch(() => {});

    void listen("app://add-project", runAddProject)
      .then((unlistenAddProjectEvent) => {
        unlistenFns.push(unlistenAddProjectEvent);
      })
      .catch(() => {});

    void listen("app://new-workspace", () => setWorkspacePickerOpen(true))
      .then((unlistenNewWorkspaceEvent) => {
        unlistenFns.push(unlistenNewWorkspaceEvent);
      })
      .catch(() => {});

    void listen("app://discard-workspace", runDiscardCurrentWorkspace)
      .then((unlistenDiscardWorkspaceEvent) => {
        unlistenFns.push(unlistenDiscardWorkspaceEvent);
      })
      .catch(() => {});

    return () => unlistenFns.forEach((unlisten) => unlisten());
  }, [openSettingsView, reloadExtensions, runAddProject, runDiscardCurrentWorkspace]);

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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyCodeEditorTileIdsRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const workspaceShortcutIndex = workspaceShortcutIndexForKeyboardEvent(event);
      if (workspaceShortcutIndex !== null) {
        event.preventDefault();
        event.stopPropagation();

        if (tilePickerOpen || workspacePickerOpen || projectSearchOpen || settingsViewOpen) return;

        const workspace = openWorkspaces[workspaceShortcutIndex];
        if (workspace) {
          runSwitchWorkspace(workspace.id);
        }
        return;
      }

      const commandId = commandIdForKeyboardEvent(event);
      if (!commandId) return;

      event.preventDefault();
      event.stopPropagation();

      const runsOverOverlay = commandId === "settings.open" || commandId === "extensions.reload";
      if ((tilePickerOpen || workspacePickerOpen || projectSearchOpen) && !runsOverOverlay) return;
      if (settingsViewOpen && !runsOverOverlay) return;

      const command = commandById.get(commandId);
      if (!command || !command.canRun(layoutRef.current)) return;
      command.run(commandApi);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    commandApi,
    commandById,
    openWorkspaces,
    projectSearchOpen,
    runSwitchWorkspace,
    settingsViewOpen,
    tilePickerOpen,
    workspacePickerOpen,
  ]);

  const workspaceRoot = context?.workspace.root;
  const showGitBranch = Boolean(context?.gitBranch && context.gitBranch !== context.workspace.name);
  const projectName = context?.project.name ?? (contextLoaded ? "" : "Loading project");

  const updateSettings = (updater: (previous: AppSettings) => AppSettings) => {
    setSettings((previous) => {
      const nextSettings = updater(previous);
      void updateAppSettings(nextSettings).catch(() => {});
      return nextSettings;
    });
  };

  const setDebugLayoutSetting = (debugLayout: boolean) => {
    updateSettings((previous) => ({ ...previous, debugLayout }));
  };

  const setTileSettings = (tileSettings: AppSettings["tileSettings"]) => {
    updateSettings((previous) => ({ ...previous, tileSettings }));
  };

  const setThemeSetting = (themeId: ThemeId) => {
    updateSettings((previous) => ({ ...previous, themeId }));
  };

  const setTileHeadersVisibleSetting = (tileHeadersVisible: boolean) => {
    updateSettings((previous) => ({ ...previous, tileHeadersVisible }));
  };

  const setDiffColorPolaritySetting = (diffColorPolarity: AppSettings["diffColorPolarity"]) => {
    updateSettings((previous) => ({ ...previous, diffColorPolarity }));
  };

  const setWorkspaceBranchPrefixSetting = (workspaceBranchPrefix: string) => {
    updateSettings((previous) => ({ ...previous, workspaceBranchPrefix }));
  };

  const setTilePickerItemVisibility = (itemId: ConfigurableTilePickerItemId, visible: boolean) => {
    updateSettings((previous) => ({
      ...previous,
      tilePickerVisibility: {
        ...previous.tilePickerVisibility,
        [itemId]: visible,
      },
    }));
  };

  const setProjectSettings = (projectId: string, projectSettings: ProjectSettings) => {
    setRegisteredProjects((previous) =>
      previous.map((project) =>
        project.id === projectId ? { ...project, settings: projectSettings } : project,
      ),
    );
    void updateProjectSettings(projectId, projectSettings).catch(() => refreshProjects());
  };

  const createTile = (
    tileOptions:
      | { kind: "terminal"; title: string }
      | { kind: "workspace"; title: string }
      | { kind: "code"; title: string }
      | { kind: "diff"; title: string }
      | {
          kind: "tool";
          title: string;
          extensionId: string;
          integrationId: string;
          integrationTileId: string;
        },
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

  const codeTileTarget = () => {
    const { tiles, focusedTileId } = layoutRef.current;
    const focusedTile = tiles.find((tile) => tile.id === focusedTileId);
    if (focusedTile?.kind === "code") return focusedTile.id;
    const lastFocusedCodeTileId = lastFocusedCodeTileIdRef.current;
    if (lastFocusedCodeTileId) {
      const lastFocusedCodeTile = tiles.find((tile) => tile.id === lastFocusedCodeTileId);
      if (lastFocusedCodeTile?.kind === "code") return lastFocusedCodeTile.id;
    }
    return tiles.find((tile) => tile.kind === "code")?.id ?? null;
  };

  const openProjectFile = (path: string, splitDirection?: TileSplitDirection) => {
    setProjectSearchOpen(false);
    const existingOpenTile = layoutRef.current.tiles.find(
      (tile) => tile.kind === "code" && tile.editor?.tabs.some((tab) => tab.path === path),
    );
    const request = { path, token: Date.now() };

    if (!splitDirection) {
      const existingCodeTileId = existingOpenTile?.id ?? codeTileTarget();
      if (existingCodeTileId) {
        setCodeEditorOpenFileRequests((previous) => ({
          ...previous,
          [existingCodeTileId]: request,
        }));
        setLayout((previous) => ({ ...previous, focusedTileId: existingCodeTileId }));
        lastFocusedCodeTileIdRef.current = existingCodeTileId;
        return;
      }
    }

    const previousTileIds = new Set(layoutRef.current.tiles.map((tile) => tile.id));
    const result = splitFocusedTile(
      layoutRef.current.tiles,
      layoutRef.current.focusedTileId,
      {
        kind: "code",
        title: "Code Editor",
      },
      splitDirection,
    );
    const newCodeTile = result.tiles.find(
      (tile) => !previousTileIds.has(tile.id) && tile.kind === "code",
    );
    if (!newCodeTile) {
      addToast({ severity: "error", title: "Could not create a code editor tile" });
      return;
    }

    setCodeEditorOpenFileRequests((previous) => ({ ...previous, [newCodeTile.id]: request }));
    setLayout((previous) => ({ ...previous, tiles: result.tiles, focusedTileId: newCodeTile.id }));
    lastFocusedCodeTileIdRef.current = newCodeTile.id;
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
    () =>
      getTilePickerItems(configurableTilePickerItems, tilePickerVisibility).map((item) => {
        if (item.kind !== "tool") return item;

        const availability = toolAvailabilityByPickerItemId.get(item.id);
        if (!toolAvailabilityLoaded) {
          return { ...item, disabled: true, detail: "Checking availability…" };
        }
        if (availability?.status === "available") {
          return { ...item, detail: availability.resolvedPath };
        }
        if (availability?.status === "unavailable") {
          return {
            ...item,
            disabled: true,
            detail: "Not installed",
          };
        }

        return { ...item, disabled: true, detail: "Availability unknown" };
      }),
    [
      configurableTilePickerItems,
      tilePickerVisibility,
      toolAvailabilityByPickerItemId,
      toolAvailabilityLoaded,
    ],
  );
  const recentProjectFileItems = useMemo<PickerItem[]>(() => {
    if (!currentWorkspaceId) return [];
    return (recentProjectFilesByWorkspace[currentWorkspaceId] ?? []).map((path) => ({
      id: path,
      title: path,
      icon: fileIconForPath(path),
      searchText: path,
      detail: "Recent",
    }));
  }, [currentWorkspaceId, recentProjectFilesByWorkspace]);

  const workspacePickerItems = useMemo<PickerItem[]>(() => {
    const projects = [...registeredProjects].sort((left, right) => {
      if (left.root === context?.project.root) return -1;
      if (right.root === context?.project.root) return 1;
      return left.name.localeCompare(right.name);
    });

    return projects
      .map((project) => {
        const disabled = project.kind !== "git" || project.rootAvailable === false;
        const title =
          project.rootAvailable === false
            ? `${project.name} (missing)`
            : project.kind === "git"
              ? project.name
              : `${project.name} (plain project)`;

        return {
          id: project.id,
          title,
          icon: project.kind === "git" ? "⎇" : "⌂",
          disabled,
        };
      })
      .concat({ id: "project.add", title: "Add Project…", icon: "+", disabled: false });
  }, [context?.project.root, registeredProjects]);

  return (
    <main className="app-shell">
      <header className="top-bar" data-tauri-drag-region onMouseDown={startWindowDrag}>
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
              const tilePickerItem = findTilePickerItemForTile(configurableTilePickerItems, tile);

              return (
                <article
                  key={tile.id}
                  className={[
                    "tile",
                    focused ? "tile-focused" : "",
                    focusMode ? "tile-focus-mode" : "",
                    hiddenByFocusMode ? "tile-hidden-by-focus-mode" : "",
                    focused && layoutMutationPreview ? "tile-layout-mutation-preview" : "",
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
                      <span className="tile-title-text">
                        {tile.title}
                        {dirtyCodeEditorTileIds.has(tile.id) ? " ●" : ""}
                      </span>
                    </span>
                    {focusMode ? (
                      <button
                        className="tile-focus-close-button"
                        type="button"
                        aria-label="Exit focus mode"
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={() =>
                          setLayout((previous) => ({ ...previous, focusModeTileId: null }))
                        }
                      >
                        ×
                      </button>
                    ) : debugLayout ? (
                      <span className="tile-meta">
                        {tile.x},{tile.y} {tile.w}×{tile.h}
                      </span>
                    ) : null}
                  </div>
                  <div className="tile-body">
                    {tile.kind === "workspace" ? (
                      <WorkspaceTile
                        workspaces={openWorkspaces}
                        currentWorkspaceId={currentWorkspaceId}
                        active={focused}
                        showPaths={debugLayout}
                        deletionPositiveStatColors={diffColorPolarity === "reversed"}
                        onSwitchWorkspace={runSwitchWorkspace}
                        onDiscardWorkspace={runDiscardWorkspace}
                      />
                    ) : tile.kind === "code" ? (
                      <CodeEditorTile
                        active={focused}
                        workspaceId={currentWorkspaceId ?? ""}
                        themeId={resolvedThemeId}
                        settings={normalizeCodeEditorSettings(tileSettings.codeEditor)}
                        editorState={tile.editor}
                        openFileRequest={codeEditorOpenFileRequests[tile.id]}
                        onEditorStateChange={(editor) => {
                          setLayout((previous) => {
                            const currentTile = previous.tiles.find(
                              (candidate) => candidate.id === tile.id,
                            );
                            if (!currentTile || currentTile.kind !== "code") return previous;
                            if (
                              JSON.stringify(currentTile.editor ?? null) ===
                              JSON.stringify(editor ?? null)
                            ) {
                              return previous;
                            }
                            return {
                              ...previous,
                              tiles: previous.tiles.map((candidate) =>
                                candidate.id === tile.id && candidate.kind === "code"
                                  ? { ...candidate, editor }
                                  : candidate,
                              ),
                            };
                          });
                        }}
                        onFileVisited={recordCurrentWorkspaceFileVisit}
                        onFileSaved={() => setDiffRefreshToken((token) => token + 1)}
                        onDirtyStateChange={(dirty) => setCodeEditorDirtyState(tile.id, dirty)}
                        onRegisterController={(controller) =>
                          registerCodeEditorController(tile.id, controller)
                        }
                        confirmDirty={requestDirtyEditorDisposition}
                        onToast={addToast}
                      />
                    ) : tile.kind === "diff" ? (
                      <DiffTile
                        workspaceId={currentWorkspaceId}
                        refreshToken={diffRefreshToken}
                        themeId={resolvedThemeId}
                        diffColorPolarity={diffColorPolarity}
                      />
                    ) : tile.kind === "tool" && !integrationCatalogLoaded ? (
                      <div className="tile-placeholder">Loading Integration Tile…</div>
                    ) : tile.kind === "tool" &&
                      !toolTileResolves(tile, configurableTilePickerItems) ? (
                      <UnavailableIntegrationTile tile={tile} />
                    ) : workspaceRoot ? (
                      <TerminalTile
                        workspaceId={currentWorkspaceId ?? ""}
                        tileId={tile.id}
                        cwd={workspaceRoot}
                        active={focused}
                        launch={terminalLaunchForTile(tile)}
                        terminalFontSize={tileSettings.terminal.fontSize}
                        themeId={resolvedThemeId}
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

      {dirtyEditorPrompt ? (
        <div className="modal-backdrop">
          <section className="dirty-editor-modal" role="dialog" aria-modal="true">
            <h2>{dirtyEditorPrompt.title}</h2>
            <p>{dirtyEditorPrompt.message}</p>
            <div className="dirty-editor-modal-actions">
              <button type="button" onClick={() => resolveDirtyEditorPrompt("discard")}>
                {dirtyEditorPrompt.discardLabel ?? "Discard"}
              </button>
              <button type="button" onClick={() => resolveDirtyEditorPrompt("cancel")}>
                {dirtyEditorPrompt.cancelLabel ?? "Cancel"}
              </button>
              <button
                className="primary-button"
                type="button"
                onClick={() => resolveDirtyEditorPrompt("save")}
              >
                {dirtyEditorPrompt.saveLabel ?? "Save"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {settingsViewOpen ? (
        <SettingsView
          debugLayout={debugLayout}
          onDebugLayoutChange={setDebugLayoutSetting}
          tileSettings={tileSettings}
          onTileSettingsChange={setTileSettings}
          themeId={themeId}
          onThemeChange={setThemeSetting}
          tileHeadersVisible={tileHeadersVisible}
          onTileHeadersVisibleChange={setTileHeadersVisibleSetting}
          diffColorPolarity={diffColorPolarity}
          onDiffColorPolarityChange={setDiffColorPolaritySetting}
          workspaceBranchPrefix={workspaceBranchPrefix}
          onWorkspaceBranchPrefixChange={setWorkspaceBranchPrefixSetting}
          tilePickerVisibility={tilePickerVisibility}
          configurableTilePickerItems={configurableTilePickerItems}
          toolAvailabilityByPickerItemId={toolAvailabilityByPickerItemId}
          toolAvailabilityLoaded={toolAvailabilityLoaded}
          onTilePickerVisibilityChange={setTilePickerItemVisibility}
          onRefreshToolAvailabilities={() => void refreshToolAvailabilities()}
          extensionSettings={extensionSettings}
          extensionSettingsLoaded={extensionSettingsLoaded}
          onReloadExtensions={reloadExtensions}
          projects={registeredProjects}
          projectsLoaded={projectsLoaded}
          onProjectSettingsChange={setProjectSettings}
          onRemoveProject={runRemoveProject}
          onResetApplication={runResetApplication}
          onClose={() => setSettingsViewOpen(false)}
          focusToken={settingsViewFocusToken}
          initialCategory={settingsViewInitialCategory}
        />
      ) : null}

      {workspacePickerOpen ? (
        <Picker
          title="New Workspace"
          items={workspacePickerItems}
          onClose={() => setWorkspacePickerOpen(false)}
          onSelect={(item: PickerItem) => {
            if (item.id === "project.add") {
              runAddProject();
              return;
            }
            runCreateWorkspace(item.id);
          }}
        />
      ) : null}

      {projectSearchOpen ? (
        <Picker
          title="Search Project Files"
          items={projectFileItems}
          emptyQueryItems={recentProjectFileItems}
          maxVisibleItems={10}
          footer={
            projectFileIndexLoading ? (
              "Indexing files…"
            ) : (
              <>
                <PickerShortcutHint label="Open" keys={["Enter"]} />
                <PickerShortcutSeparator />
                <PickerShortcutHint label="Open to side" keys={["⇧", "Enter"]} />
              </>
            )
          }
          shiftEnterSplitDirection="right"
          onClose={() => setProjectSearchOpen(false)}
          onSelect={(item: PickerItem, options) =>
            openProjectFile(item.id, options.alternate ? options.splitDirection : undefined)
          }
        />
      ) : null}

      {tilePickerOpen ? (
        <Picker
          title="New Tile"
          items={tilePickerItems}
          footer={
            <>
              <PickerShortcutHint label="Split right" keys={["Enter"]} />
              <PickerShortcutSeparator />
              <PickerShortcutHint label="Split down" keys={["⇧", "Enter"]} />
            </>
          }
          onClose={() => setTilePickerOpen(false)}
          onSelect={(item: PickerItem, options) => {
            const catalogItem = findTilePickerItem(configurableTilePickerItems, item.id);
            if (!catalogItem) return;
            createTile(tileOptionsForCatalogItem(catalogItem), options.splitDirection);
          }}
        />
      ) : null}
    </main>
  );
}
