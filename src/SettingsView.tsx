import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME } from "./appConstants";
import {
  codeEditorFontSizeMax,
  codeEditorFontSizeMin,
  codeEditorTabSizeMax,
  codeEditorTabSizeMin,
  type DiffColorPolarity,
  normalizeCodeEditorSettings,
  normalizeTerminalTileSettings,
  terminalFontSizeMax,
  terminalFontSizeMin,
} from "./settings";
import { themeOptions, type ThemeId } from "./themeRegistry";
import { keyboardShortcutGroups } from "./commands";
import { KeyChord } from "./KeyCap";
import { Slider } from "./Slider";
import { Toggle } from "./Toggle";
import {
  defaultConfigurableTilePickerItems,
  type ConfigurableTilePickerCatalogItem,
  type ConfigurableTilePickerItemId,
  type TilePickerVisibility,
} from "./tilePickerCatalog";
import type {
  ExtensionDiagnostic,
  ExtensionSettingsEntry,
  ExtensionSettingsResponse,
  CodeEditorSettings,
  ProjectSettings,
  RegisteredProject,
  TerminalTileSettings,
  TileSettings,
  ToolAvailability,
} from "./types";

const terminalFontSizeStep = 1;
const codeEditorFontSizeStep = 1;
const codeEditorTabSizeStep = 1;

type SettingsScope = "global" | "project";
type SettingsCategoryId = "general" | "appearance" | "tiles" | "extensions" | "keybinds";
type ProjectSettingsCategoryId = "overview" | "workspaces" | "search";
type FocusPane = "left" | "right";

const settingsCategories: { id: SettingsCategoryId; title: string }[] = [
  { id: "general", title: "General" },
  { id: "appearance", title: "Appearance" },
  { id: "tiles", title: "Tiles" },
  { id: "extensions", title: "Extensions" },
  { id: "keybinds", title: "Keybinds" },
];

const projectSettingsCategories: { id: ProjectSettingsCategoryId; title: string }[] = [
  { id: "overview", title: "Overview" },
  { id: "workspaces", title: "Workspaces" },
  { id: "search", title: "Search" },
];

interface SettingsViewProps {
  debugLayout: boolean;
  onDebugLayoutChange: (enabled: boolean) => void;
  tileSettings: TileSettings;
  onTileSettingsChange: (settings: TileSettings) => void;
  themeId: ThemeId;
  onThemeChange: (themeId: ThemeId) => void;
  tileHeadersVisible: boolean;
  onTileHeadersVisibleChange: (visible: boolean) => void;
  diffColorPolarity: DiffColorPolarity;
  onDiffColorPolarityChange: (polarity: DiffColorPolarity) => void;
  workspaceBranchPrefix: string;
  onWorkspaceBranchPrefixChange: (prefix: string) => void;
  tilePickerVisibility: TilePickerVisibility;
  configurableTilePickerItems: ConfigurableTilePickerCatalogItem[];
  toolAvailabilityByPickerItemId: Map<string, ToolAvailability>;
  toolAvailabilityLoaded: boolean;
  onTilePickerVisibilityChange: (itemId: ConfigurableTilePickerItemId, visible: boolean) => void;
  onRefreshToolAvailabilities: () => void;
  extensionSettings: ExtensionSettingsResponse | null;
  extensionSettingsLoaded: boolean;
  onReloadExtensions: () => void;
  projects: RegisteredProject[];
  projectsLoaded: boolean;
  onProjectSettingsChange: (projectId: string, settings: ProjectSettings) => void;
  onRemoveProject: (projectId: string) => void;
  onResetApplication: () => void;
  onClose: () => void;
  focusToken: number;
  initialCategory?: SettingsCategoryId | null;
}

let lastSettingsScope: SettingsScope = "global";
let lastGlobalCategoryId: SettingsCategoryId = "general";
let lastProjectCategoryId: ProjectSettingsCategoryId = "overview";
let lastSelectedProjectId: string | null = null;

function projectSort(left: RegisteredProject, right: RegisteredProject) {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function workspaceBranchPrefixPreview(prefix: string) {
  return `${prefix.trim()}task`;
}

function sortedTilePickerConfigurationItems(
  items: ConfigurableTilePickerCatalogItem[],
  visibility: TilePickerVisibility,
) {
  return [...items].sort((left, right) => {
    const visibilityComparison =
      Number(visibility[right.id] ?? right.defaultVisible) -
      Number(visibility[left.id] ?? left.defaultVisible);
    if (visibilityComparison !== 0) return visibilityComparison;

    const titleComparison = left.title.localeCompare(right.title, undefined, {
      sensitivity: "base",
    });
    if (titleComparison !== 0) return titleComparison;

    return left.id.localeCompare(right.id);
  });
}

function reconcileTilePickerConfigurationItems(
  currentItems: ConfigurableTilePickerCatalogItem[],
  nextItems: ConfigurableTilePickerCatalogItem[],
  visibility: TilePickerVisibility,
) {
  const nextItemsById = new Map(nextItems.map((item) => [item.id, item]));
  const currentIds = new Set(currentItems.map((item) => item.id));
  const preservedItems = currentItems
    .map((item) => nextItemsById.get(item.id))
    .filter((item): item is ConfigurableTilePickerCatalogItem => Boolean(item));
  const addedItems = nextItems.filter((item) => !currentIds.has(item.id));

  return [...preservedItems, ...sortedTilePickerConfigurationItems(addedItems, visibility)];
}

function codeEditorControlIds(prefix: string) {
  return [
    `${prefix}:line-numbers`,
    `${prefix}:minimap`,
    `${prefix}:word-wrap`,
    `${prefix}:font-size`,
    `${prefix}:tab-size`,
    `${prefix}:vim-mode`,
    `${prefix}:bracket-pair-colorization`,
    `${prefix}:sticky-scroll`,
    `${prefix}:auto-save`,
    `${prefix}:tabs-visible`,
    `${prefix}:tab-title-mode`,
  ];
}

function terminalControlIds(prefix: string) {
  return [`${prefix}:font-size`];
}

function tileSettingsControlIds(item: ConfigurableTilePickerCatalogItem) {
  if (item.kind === "terminal") return terminalControlIds("tile-terminal");
  if (item.kind === "code") return codeEditorControlIds("tile-code-editor");
  return [];
}

function controlIdsForSelection(
  scope: SettingsScope,
  globalCategory: SettingsCategoryId,
  projectCategory: ProjectSettingsCategoryId,
  project: RegisteredProject | null,
  tilePickerItems = defaultConfigurableTilePickerItems,
  expandedTileSettingsItemId: string | null = null,
) {
  if (scope === "global") {
    if (globalCategory === "general") {
      return ["workspace-branch-prefix", "debug-layout", "reset-application"];
    }
    if (globalCategory === "appearance") {
      return ["app-theme", "tile-headers", "diff-color-polarity"];
    }
    if (globalCategory === "tiles") {
      return [
        "tile-picker-refresh",
        "tile-picker-search",
        ...tilePickerItems.flatMap((item) => [
          `tile-picker:${item.id}`,
          ...(expandedTileSettingsItemId === item.id ? tileSettingsControlIds(item) : []),
        ]),
      ];
    }
    if (globalCategory === "extensions") return ["extensions-reload"];
    return keyboardShortcutGroups.flatMap((group) =>
      group.shortcuts.map((shortcut) => shortcut.id),
    );
  }

  if (!project) return [];
  if (projectCategory === "workspaces") {
    return project.kind === "git"
      ? [
          "project-workspace-branch-prefix",
          "workspace-copy-files",
          "delete-workspace-branch-on-discard",
        ]
      : [];
  }
  if (projectCategory === "overview") return ["disconnect-project"];
  if (projectCategory === "search") return ["project-search-includes", "project-search-excludes"];
  return [];
}

export function SettingsView({
  debugLayout,
  onDebugLayoutChange,
  tileSettings,
  onTileSettingsChange,
  themeId,
  onThemeChange,
  tileHeadersVisible,
  onTileHeadersVisibleChange,
  diffColorPolarity,
  onDiffColorPolarityChange,
  workspaceBranchPrefix,
  onWorkspaceBranchPrefixChange,
  tilePickerVisibility,
  configurableTilePickerItems,
  toolAvailabilityByPickerItemId,
  toolAvailabilityLoaded,
  onTilePickerVisibilityChange,
  onRefreshToolAvailabilities,
  extensionSettings,
  extensionSettingsLoaded,
  onReloadExtensions,
  projects,
  projectsLoaded,
  onProjectSettingsChange,
  onRemoveProject,
  onResetApplication,
  onClose,
  focusToken,
  initialCategory,
}: SettingsViewProps) {
  const viewRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const projectPickerRef = useRef<HTMLSelectElement | null>(null);
  const themeRef = useRef<HTMLSelectElement | null>(null);
  const diffColorPolarityRef = useRef<HTMLSelectElement | null>(null);
  const workspaceBranchPrefixRef = useRef<HTMLInputElement | null>(null);
  const projectWorkspaceBranchPrefixRef = useRef<HTMLInputElement | null>(null);
  const workspaceCopyFilesRef = useRef<HTMLTextAreaElement | null>(null);
  const projectSearchIncludesRef = useRef<HTMLTextAreaElement | null>(null);
  const projectSearchExcludesRef = useRef<HTMLTextAreaElement | null>(null);
  const [focusPane, setFocusPane] = useState<FocusPane>("left");
  const [settingsScope, setSettingsScope] = useState<SettingsScope>(lastSettingsScope);
  const [selectedGlobalCategory, setSelectedGlobalCategory] =
    useState<SettingsCategoryId>(lastGlobalCategoryId);
  const [selectedProjectCategory, setSelectedProjectCategory] =
    useState<ProjectSettingsCategoryId>(lastProjectCategoryId);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(lastSelectedProjectId);
  const [activeControlId, setActiveControlId] = useState("debug-layout");
  const [tilePickerQuery, setTilePickerQuery] = useState("");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const tilePickerPageSelected = settingsScope === "global" && selectedGlobalCategory === "tiles";
  const tilePickerPageSelectedRef = useRef(tilePickerPageSelected);
  const [tilePickerDisplayItems, setTilePickerDisplayItems] = useState(() =>
    sortedTilePickerConfigurationItems(configurableTilePickerItems, tilePickerVisibility),
  );
  const [expandedTileSettingsItemId, setExpandedTileSettingsItemId] = useState<string | null>(null);
  const [pendingReset, setPendingReset] = useState(false);
  const [pendingProjectRemovalId, setPendingProjectRemovalId] = useState<string | null>(null);

  const sortedProjects = useMemo(() => [...projects].sort(projectSort), [projects]);
  const selectedProject = selectedProjectId
    ? (sortedProjects.find((project) => project.id === selectedProjectId) ?? null)
    : null;
  const activeSidebarCategories =
    settingsScope === "global" ? settingsCategories : projectSettingsCategories;
  const selectedSidebarCategoryId =
    settingsScope === "global" ? selectedGlobalCategory : selectedProjectCategory;
  const rightControlIds = useMemo(
    () =>
      controlIdsForSelection(
        settingsScope,
        selectedGlobalCategory,
        selectedProjectCategory,
        selectedProject,
        tilePickerDisplayItems,
        expandedTileSettingsItemId,
      ),
    [
      settingsScope,
      selectedGlobalCategory,
      selectedProjectCategory,
      selectedProject,
      tilePickerDisplayItems,
      expandedTileSettingsItemId,
    ],
  );
  const visibleTilePickerItems = useMemo(() => {
    const query = tilePickerQuery.trim().toLowerCase();
    if (!query) return tilePickerDisplayItems;
    return tilePickerDisplayItems.filter((item) => item.title.toLowerCase().includes(query));
  }, [tilePickerDisplayItems, tilePickerQuery]);

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion("Unknown"));
  }, []);

  useEffect(() => {
    const wasTilePickerPageSelected = tilePickerPageSelectedRef.current;
    tilePickerPageSelectedRef.current = tilePickerPageSelected;

    setTilePickerDisplayItems((currentItems) => {
      if (!tilePickerPageSelected || !wasTilePickerPageSelected) {
        return sortedTilePickerConfigurationItems(
          configurableTilePickerItems,
          tilePickerVisibility,
        );
      }

      return reconcileTilePickerConfigurationItems(
        currentItems,
        configurableTilePickerItems,
        tilePickerVisibility,
      );
    });
  }, [configurableTilePickerItems, tilePickerPageSelected, tilePickerVisibility]);

  useEffect(() => {
    if (initialCategory) {
      setSettingsScope("global");
      setSelectedGlobalCategory(initialCategory);
    }
    setFocusPane("left");
    viewRef.current?.focus();
  }, [focusToken, initialCategory]);

  useEffect(() => {
    lastSettingsScope = settingsScope;
    lastGlobalCategoryId = selectedGlobalCategory;
    lastProjectCategoryId = selectedProjectCategory;
    lastSelectedProjectId = selectedProjectId;
  }, [settingsScope, selectedGlobalCategory, selectedProjectCategory, selectedProjectId]);

  useEffect(() => {
    if (sortedProjects.length === 0) {
      if (selectedProjectId !== null) setSelectedProjectId(null);
      return;
    }
    if (selectedProjectId && sortedProjects.some((project) => project.id === selectedProjectId)) {
      return;
    }
    setSelectedProjectId(sortedProjects[0].id);
  }, [selectedProjectId, sortedProjects]);

  useEffect(() => {
    const validControlIds = controlIdsForSelection(
      settingsScope,
      selectedGlobalCategory,
      selectedProjectCategory,
      selectedProject,
      tilePickerDisplayItems,
      expandedTileSettingsItemId,
    );
    if (validControlIds.includes(activeControlId)) return;
    setActiveControlId(validControlIds[0] ?? "");
  }, [
    activeControlId,
    settingsScope,
    selectedGlobalCategory,
    selectedProjectCategory,
    selectedProject,
    tilePickerDisplayItems,
    expandedTileSettingsItemId,
  ]);

  useEffect(() => {
    if (focusPane === "right") viewRef.current?.focus();
  }, [focusPane, activeControlId]);

  const moveLeftSelection = (delta: number) => {
    if (activeSidebarCategories.length === 0) return;
    const currentIndex = activeSidebarCategories.findIndex(
      (category) => category.id === selectedSidebarCategoryId,
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + activeSidebarCategories.length) % activeSidebarCategories.length;
    const nextCategory = activeSidebarCategories[nextIndex];
    if (settingsScope === "global") {
      setSelectedGlobalCategory(nextCategory.id as SettingsCategoryId);
    } else {
      setSelectedProjectCategory(nextCategory.id as ProjectSettingsCategoryId);
    }
    setPendingReset(false);
    setPendingProjectRemovalId(null);
  };

  const moveRightSelection = (delta: number) => {
    if (rightControlIds.length === 0) return;
    const currentIndex = rightControlIds.indexOf(activeControlId);
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + rightControlIds.length) % rightControlIds.length;
    setActiveControlId(rightControlIds[nextIndex]);
  };

  const terminalTileSettings = normalizeTerminalTileSettings(tileSettings.terminal);
  const codeEditorSettings = normalizeCodeEditorSettings(tileSettings.codeEditor);

  const updateTerminalTileSettings = (patch: Partial<TerminalTileSettings>) => {
    onTileSettingsChange({
      ...tileSettings,
      terminal: normalizeTerminalTileSettings({ ...tileSettings.terminal, ...patch }),
    });
  };

  const updateCodeEditorSettings = (patch: Partial<CodeEditorSettings>) => {
    onTileSettingsChange({
      ...tileSettings,
      codeEditor: normalizeCodeEditorSettings({ ...tileSettings.codeEditor, ...patch }),
    });
  };

  const toggleProjectBranchDiscardPolicy = () => {
    if (!selectedProject || selectedProject.kind !== "git") return;
    onProjectSettingsChange(selectedProject.id, {
      ...selectedProject.settings,
      deleteWorkspaceBranchOnDiscard: !selectedProject.settings.deleteWorkspaceBranchOnDiscard,
    });
  };

  const updateProjectWorkspaceBranchPrefix = (value: string) => {
    if (!selectedProject || selectedProject.kind !== "git") return;
    onProjectSettingsChange(selectedProject.id, {
      ...selectedProject.settings,
      workspaceBranchPrefix: value.trim().length === 0 ? null : value,
    });
  };

  const updateProjectWorkspaceCopyFiles = (value: string) => {
    if (!selectedProject || selectedProject.kind !== "git") return;
    onProjectSettingsChange(selectedProject.id, {
      ...selectedProject.settings,
      workspaceCopyFiles: value.length === 0 ? [] : value.split(/\r?\n/),
    });
  };

  const updateProjectSearchIncludePaths = (value: string) => {
    if (!selectedProject) return;
    onProjectSettingsChange(selectedProject.id, {
      ...selectedProject.settings,
      projectSearchIncludePaths: value.length === 0 ? [] : value.split(/\r?\n/),
    });
  };

  const updateProjectSearchExcludePaths = (value: string) => {
    if (!selectedProject) return;
    onProjectSettingsChange(selectedProject.id, {
      ...selectedProject.settings,
      projectSearchExcludePaths: value.length === 0 ? [] : value.split(/\r?\n/),
    });
  };

  const confirmResetApplication = () => {
    if (!pendingReset) {
      setPendingReset(true);
      return;
    }
    setPendingReset(false);
    onResetApplication();
  };

  const confirmProjectRemoval = () => {
    if (!selectedProject) return;
    if (pendingProjectRemovalId !== selectedProject.id) {
      setPendingProjectRemovalId(selectedProject.id);
      return;
    }

    const currentIndex = sortedProjects.findIndex((project) => project.id === selectedProject.id);
    const nextProject =
      sortedProjects[currentIndex + 1] ?? sortedProjects[currentIndex - 1] ?? null;
    setPendingProjectRemovalId(null);
    setSelectedProjectId(nextProject?.id ?? null);
    if (!nextProject) {
      setSettingsScope("global");
      setSelectedGlobalCategory("general");
    }
    setFocusPane("left");
    onRemoveProject(selectedProject.id);
  };

  const activateCodeEditorControl = (controlId: string) => {
    if (!controlId.startsWith("tile-code-editor:")) return;
    const key = controlId.slice("tile-code-editor:".length);
    const current = codeEditorSettings;

    if (key === "line-numbers") {
      updateCodeEditorSettings({ lineNumbersVisible: !current.lineNumbersVisible });
    }
    if (key === "minimap") updateCodeEditorSettings({ minimapVisible: !current.minimapVisible });
    if (key === "word-wrap") updateCodeEditorSettings({ wordWrap: !current.wordWrap });
    if (key === "vim-mode") updateCodeEditorSettings({ vimMode: !current.vimMode });
    if (key === "bracket-pair-colorization") {
      updateCodeEditorSettings({ bracketPairColorization: !current.bracketPairColorization });
    }
    if (key === "sticky-scroll") updateCodeEditorSettings({ stickyScroll: !current.stickyScroll });
    if (key === "tabs-visible") updateCodeEditorSettings({ tabsVisible: !current.tabsVisible });
  };

  const activateControl = () => {
    if (activeControlId === "debug-layout") {
      onDebugLayoutChange(!debugLayout);
      return;
    }
    if (activeControlId === "tile-headers") {
      onTileHeadersVisibleChange(!tileHeadersVisible);
      return;
    }
    if (activeControlId.startsWith("tile-code-editor:")) {
      activateCodeEditorControl(activeControlId);
      return;
    }
    if (activeControlId === "tile-picker-refresh") {
      onRefreshToolAvailabilities();
      return;
    }
    if (activeControlId === "extensions-reload") {
      onReloadExtensions();
      return;
    }
    if (activeControlId === "tile-picker-search") {
      searchRef.current?.focus();
      return;
    }
    if (activeControlId === "app-theme") {
      themeRef.current?.focus();
      return;
    }
    if (activeControlId === "diff-color-polarity") {
      diffColorPolarityRef.current?.focus();
      return;
    }
    if (activeControlId === "workspace-branch-prefix") {
      workspaceBranchPrefixRef.current?.focus();
      return;
    }
    if (activeControlId === "project-workspace-branch-prefix") {
      projectWorkspaceBranchPrefixRef.current?.focus();
      return;
    }
    if (activeControlId.startsWith("tile-picker:")) {
      const itemId = activeControlId.slice("tile-picker:".length) as ConfigurableTilePickerItemId;
      onTilePickerVisibilityChange(itemId, !tilePickerVisibility[itemId]);
      return;
    }
    if (activeControlId === "workspace-copy-files") {
      workspaceCopyFilesRef.current?.focus();
      return;
    }
    if (activeControlId === "project-search-includes") {
      projectSearchIncludesRef.current?.focus();
      return;
    }
    if (activeControlId === "project-search-excludes") {
      projectSearchExcludesRef.current?.focus();
      return;
    }
    if (activeControlId === "delete-workspace-branch-on-discard") {
      toggleProjectBranchDiscardPolicy();
      return;
    }
    if (activeControlId === "disconnect-project") {
      confirmProjectRemoval();
      return;
    }
    if (activeControlId === "reset-application") {
      confirmResetApplication();
    }
  };

  const expandActiveTileSettingsRow = () => {
    if (!activeControlId.startsWith("tile-picker:")) return false;
    const itemId = activeControlId.slice("tile-picker:".length);
    const item = tilePickerDisplayItems.find((candidate) => candidate.id === itemId);
    if (!item || tileSettingsControlIds(item).length === 0) return false;
    setExpandedTileSettingsItemId(item.id);
    return true;
  };

  const collapseActiveTileSettingsRow = () => {
    if (activeControlId.startsWith("tile-picker:")) {
      const itemId = activeControlId.slice("tile-picker:".length);
      if (expandedTileSettingsItemId !== itemId) return false;
      setExpandedTileSettingsItemId(null);
      return true;
    }
    if (activeControlId.startsWith("tile-terminal:")) {
      setExpandedTileSettingsItemId(null);
      setActiveControlId("tile-picker:terminal");
      return true;
    }
    if (activeControlId.startsWith("tile-code-editor:")) {
      setExpandedTileSettingsItemId(null);
      setActiveControlId("tile-picker:code");
      return true;
    }
    return false;
  };

  const adjustControl = (delta: number) => {
    if (delta > 0 && expandActiveTileSettingsRow()) return;
    if (activeControlId === "tile-terminal:font-size") {
      updateTerminalTileSettings({
        fontSize: terminalTileSettings.fontSize + delta * terminalFontSizeStep,
      });
      return;
    }
    if (activeControlId.startsWith("tile-code-editor:")) {
      adjustCodeEditorControl(activeControlId, delta);
    }
  };

  const adjustCodeEditorControl = (controlId: string, delta: number) => {
    if (!controlId.startsWith("tile-code-editor:")) return;
    const key = controlId.slice("tile-code-editor:".length);
    const current = codeEditorSettings;
    if (key === "font-size") {
      updateCodeEditorSettings({ fontSize: current.fontSize + delta * codeEditorFontSizeStep });
    } else if (key === "tab-size") {
      updateCodeEditorSettings({ tabSize: current.tabSize + delta * codeEditorTabSizeStep });
    }
  };

  const switchSettingsScope = () => {
    setSettingsScope((scope) => (scope === "global" ? "project" : "global"));
    setFocusPane("left");
    setPendingReset(false);
    setPendingProjectRemovalId(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT"
    ) {
      if (event.key === "Escape") {
        event.preventDefault();
        target.blur();
        viewRef.current?.focus();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      switchSettingsScope();
      return;
    }

    if (focusPane === "left") {
      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        moveLeftSelection(1);
        return;
      }
      if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        if (
          settingsScope === "project" &&
          selectedSidebarCategoryId === activeSidebarCategories[0]?.id
        ) {
          projectPickerRef.current?.focus();
          return;
        }
        moveLeftSelection(-1);
        return;
      }
      if (event.key === "l" || event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        setFocusPane("right");
      }
      return;
    }

    if (event.key === "j" || event.key === "ArrowDown") {
      event.preventDefault();
      moveRightSelection(1);
      return;
    }
    if (event.key === "k" || event.key === "ArrowUp") {
      event.preventDefault();
      moveRightSelection(-1);
      return;
    }
    if (event.key === "h" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (collapseActiveTileSettingsRow()) return;
      setFocusPane("left");
      return;
    }
    if (event.key === "l" || event.key === "ArrowRight") {
      event.preventDefault();
      adjustControl(1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      activateControl();
    }
  };

  const selectedTitle =
    settingsScope === "global"
      ? (settingsCategories.find((category) => category.id === selectedGlobalCategory)?.title ??
        "Settings")
      : (projectSettingsCategories.find((category) => category.id === selectedProjectCategory)
          ?.title ?? "Project Settings");

  return (
    <section
      ref={viewRef}
      className="settings-view"
      aria-label="Settings"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <header className="settings-view-header" data-tauri-drag-region>
        <div className="settings-view-titlebar">
          <h1>Settings</h1>
          <div className="settings-scope-tabs" role="tablist" aria-label="Settings scope">
            {renderScopeTab("global", "Global")}
            {renderScopeTab("project", "Project")}
          </div>
        </div>
        <button
          className="settings-close-button"
          type="button"
          onClick={onClose}
          aria-label="Close settings"
        >
          ×
        </button>
      </header>

      <div className={`settings-view-content settings-view-content-${settingsScope}`}>
        {settingsScope === "project" ? renderProjectPicker() : null}
        <div className="settings-view-main">
          <nav
            className={[
              "settings-sidebar",
              focusPane === "left" ? "settings-pane-focused" : "",
            ].join(" ")}
            aria-label="Settings sections"
          >
            <div className="settings-sidebar-section">
              {activeSidebarCategories.map((category) =>
                renderNavigationRow(category.id, category.title),
              )}
            </div>
          </nav>

          <section
            className={[
              "settings-detail",
              focusPane === "right" ? "settings-pane-focused" : "",
            ].join(" ")}
            aria-label={selectedTitle}
          >
            <header className="settings-detail-header">
              <h2>{selectedTitle}</h2>
            </header>
            {renderDetail()}
          </section>
        </div>
      </div>
    </section>
  );

  function renderScopeTab(scope: SettingsScope, title: string) {
    const selected = settingsScope === scope;
    return (
      <button
        className={["settings-scope-tab", selected ? "settings-scope-tab-selected" : ""].join(" ")}
        type="button"
        role="tab"
        aria-selected={selected}
        onClick={() => {
          setSettingsScope(scope);
          setFocusPane("left");
          setPendingReset(false);
          setPendingProjectRemovalId(null);
          viewRef.current?.focus();
        }}
      >
        {title}
      </button>
    );
  }

  function renderProjectPicker() {
    return (
      <div className="settings-project-picker-row">
        <label className="settings-project-picker-label" htmlFor="settings-project-picker">
          Project
        </label>
        <select
          ref={projectPickerRef}
          id="settings-project-picker"
          className="settings-project-picker"
          value={selectedProjectId ?? ""}
          disabled={!projectsLoaded || sortedProjects.length === 0}
          onChange={(event) => {
            setSelectedProjectId(event.currentTarget.value || null);
            setPendingProjectRemovalId(null);
          }}
        >
          {!projectsLoaded ? <option value="">Loading projects…</option> : null}
          {projectsLoaded && sortedProjects.length === 0 ? (
            <option value="">No projects registered</option>
          ) : null}
          {sortedProjects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderNavigationRow(id: SettingsCategoryId | ProjectSettingsCategoryId, title: string) {
    const selected = id === selectedSidebarCategoryId;
    const categoryIconClass = settingsScope === "global" ? `settings-sidebar-icon-${id}` : "";
    return (
      <button
        key={id}
        className={[
          "settings-sidebar-row",
          settingsScope === "global" ? "settings-sidebar-row-category" : "",
          selected ? "settings-sidebar-row-selected" : "",
          selected && focusPane === "left" ? "settings-sidebar-row-focused" : "",
        ].join(" ")}
        type="button"
        onClick={() => {
          if (settingsScope === "global") {
            setSelectedGlobalCategory(id as SettingsCategoryId);
          } else {
            setSelectedProjectCategory(id as ProjectSettingsCategoryId);
          }
          setFocusPane("left");
          setPendingReset(false);
          setPendingProjectRemovalId(null);
          viewRef.current?.focus();
        }}
      >
        {settingsScope === "global" ? (
          <span
            className={["settings-sidebar-icon", categoryIconClass].join(" ")}
            aria-hidden="true"
          />
        ) : null}
        <span className="settings-sidebar-row-title">{title}</span>
      </button>
    );
  }

  function renderDetail() {
    if (settingsScope === "project") return renderProjectDetail();
    if (selectedGlobalCategory === "general") return renderGeneralDetail();
    if (selectedGlobalCategory === "appearance") return renderAppearanceDetail();
    if (selectedGlobalCategory === "tiles") return renderTilesDetail();
    if (selectedGlobalCategory === "extensions") return renderExtensionsDetail();
    return renderKeybindsDetail();
  }

  function renderGeneralDetail() {
    return (
      <div className="settings-detail-body">
        <div className="settings-row">
          <span className="settings-row-copy">
            <span className="settings-row-title">Version</span>
            <span className="settings-row-description">Installed version.</span>
          </span>
          <span className="settings-row-control">
            <span className="settings-value">{appVersion ?? "Loading…"}</span>
          </span>
        </div>
        {renderWorkspaceBranchPrefixControl()}
        {renderToggleRow({
          id: "debug-layout",
          title: "Debug mode",
          description: "Show development-only diagnostics.",
          checked: debugLayout,
          onChange: onDebugLayoutChange,
        })}
        <div className="settings-danger-zone" aria-label="Danger Zone">
          <span className="settings-section-title">Danger Zone</span>
          {renderActionRow({
            id: "reset-application",
            title: `Reset ${APP_NAME}`,
            description: `Disconnect all projects, close workspaces, remove ${APP_NAME}-managed workspace roots, and reset settings.`,
            action: pendingReset ? "Confirm reset" : "Reset",
            danger: true,
            onClick: confirmResetApplication,
          })}
        </div>
      </div>
    );
  }

  function renderWorkspaceBranchPrefixControl() {
    const active = activeControlId === "workspace-branch-prefix" && focusPane === "right";

    return (
      <label
        className={["settings-row", active ? "settings-row-active" : ""].join(" ")}
        onClick={() => setActiveControlId("workspace-branch-prefix")}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Workspace Branch Prefix</span>
          <span className="settings-row-description">
            Prepended to generated Workspace Branch names. Preview:{" "}
            {workspaceBranchPrefixPreview(workspaceBranchPrefix)}
          </span>
        </span>
        <span className="settings-row-control">
          <input
            ref={workspaceBranchPrefixRef}
            className="settings-text-control"
            value={workspaceBranchPrefix}
            placeholder="none"
            spellCheck={false}
            onFocus={() => setActiveControlId("workspace-branch-prefix")}
            onChange={(event) => onWorkspaceBranchPrefixChange(event.currentTarget.value)}
          />
        </span>
      </label>
    );
  }

  function renderAppearanceDetail() {
    return (
      <div className="settings-detail-body">
        <label
          className={[
            "settings-row",
            activeControlId === "app-theme" && focusPane === "right" ? "settings-row-active" : "",
          ].join(" ")}
          onMouseEnter={() => setActiveControlId("app-theme")}
          onFocus={() => setActiveControlId("app-theme")}
        >
          <span className="settings-row-copy">
            <span className="settings-row-title">Theme</span>
            <span className="settings-row-description">Follow system, or choose Light/Dark.</span>
          </span>
          <span className="settings-row-control">
            <select
              ref={themeRef}
              className="settings-select-control"
              value={themeId}
              onFocus={() => setActiveControlId("app-theme")}
              onChange={(event) => onThemeChange(event.currentTarget.value as ThemeId)}
            >
              {themeOptions().map((theme) => (
                <option key={theme.id} value={theme.id}>
                  {theme.title}
                </option>
              ))}
            </select>
          </span>
        </label>
        {renderToggleRow({
          id: "tile-headers",
          title: "Tile headers",
          description: "Show title bars on workspace tiles.",
          checked: tileHeadersVisible,
          onChange: onTileHeadersVisibleChange,
        })}
        <label
          className={[
            "settings-row",
            activeControlId === "diff-color-polarity" && focusPane === "right"
              ? "settings-row-active"
              : "",
          ].join(" ")}
          onMouseEnter={() => setActiveControlId("diff-color-polarity")}
          onFocus={() => setActiveControlId("diff-color-polarity")}
        >
          <span className="settings-row-copy">
            <span className="settings-row-title">Diff colors</span>
            <span className="settings-row-description">
              Choose +/- color polarity in Diff and Workspace tiles.
            </span>
          </span>
          <span className="settings-row-control">
            <select
              ref={diffColorPolarityRef}
              className="settings-select-control"
              value={diffColorPolarity}
              onFocus={() => setActiveControlId("diff-color-polarity")}
              onChange={(event) =>
                onDiffColorPolarityChange(event.currentTarget.value as DiffColorPolarity)
              }
            >
              <option value="standard">Standard</option>
              <option value="reversed">Reversed</option>
            </select>
          </span>
        </label>
      </div>
    );
  }

  function renderCodeEditorSettingsRows(
    prefix: "tile-code-editor",
    value: CodeEditorSettings,
    onChange: (patch: Partial<CodeEditorSettings>) => void,
  ) {
    return (
      <>
        {renderToggleRow({
          id: `${prefix}:line-numbers`,
          title: "Line numbers",
          description: "Show line numbers in Code Editor tiles.",
          checked: value.lineNumbersVisible,
          onChange: (lineNumbersVisible) => onChange({ lineNumbersVisible }),
        })}
        {renderToggleRow({
          id: `${prefix}:minimap`,
          title: "Minimap",
          description: "Show the Code Editor minimap.",
          checked: value.minimapVisible,
          onChange: (minimapVisible) => onChange({ minimapVisible }),
        })}
        {renderToggleRow({
          id: `${prefix}:word-wrap`,
          title: "Word wrap",
          description: "Wrap long lines instead of scrolling horizontally.",
          checked: value.wordWrap,
          onChange: (wordWrap) => onChange({ wordWrap }),
        })}
        {renderNumberSliderRow({
          id: `${prefix}:font-size`,
          title: "Font size",
          description: "Adjust editor text size.",
          value: value.fontSize,
          min: codeEditorFontSizeMin,
          max: codeEditorFontSizeMax,
          step: codeEditorFontSizeStep,
          suffix: "px",
          ariaLabel: "Code editor font size",
          onChange: (fontSize) => onChange({ fontSize }),
        })}
        {renderNumberSliderRow({
          id: `${prefix}:tab-size`,
          title: "Tab size",
          description: "Number of spaces for indentation tabs.",
          value: value.tabSize,
          min: codeEditorTabSizeMin,
          max: codeEditorTabSizeMax,
          step: codeEditorTabSizeStep,
          suffix: " spaces",
          ariaLabel: "Code editor tab size",
          onChange: (tabSize) => onChange({ tabSize }),
        })}
        {renderToggleRow({
          id: `${prefix}:vim-mode`,
          title: "Vim mode",
          description: "Use Vim keybindings in Code Editor tiles.",
          checked: value.vimMode,
          onChange: (vimMode) => onChange({ vimMode }),
        })}
        {renderToggleRow({
          id: `${prefix}:bracket-pair-colorization`,
          title: "Bracket pair colorization",
          description: "Color matching bracket pairs.",
          checked: value.bracketPairColorization,
          onChange: (bracketPairColorization) => onChange({ bracketPairColorization }),
        })}
        {renderToggleRow({
          id: `${prefix}:sticky-scroll`,
          title: "Sticky scroll",
          description: "Pin current scope headers while scrolling.",
          checked: value.stickyScroll,
          onChange: (stickyScroll) => onChange({ stickyScroll }),
        })}
        {renderSelectRow({
          id: `${prefix}:auto-save`,
          title: "Auto-save",
          description: "Save automatically after edits or focus changes.",
          value: value.autoSave,
          options: [
            ["off", "Off"],
            ["onFocusChange", "On focus change"],
            ["afterDelay", "After delay"],
          ],
          onChange: (autoSave) =>
            onChange({ autoSave: autoSave as CodeEditorSettings["autoSave"] }),
        })}
        {renderToggleRow({
          id: `${prefix}:tabs-visible`,
          title: "Tabs",
          description: "Show the Code Editor tab strip.",
          checked: value.tabsVisible,
          onChange: (tabsVisible) => onChange({ tabsVisible }),
        })}
        {renderSelectRow({
          id: `${prefix}:tab-title-mode`,
          title: "Tab title",
          description: "Show full paths or only basenames in editor tabs.",
          value: value.tabTitleMode,
          options: [
            ["path", "Full path"],
            ["basename", "Basename"],
          ],
          onChange: (tabTitleMode) =>
            onChange({ tabTitleMode: tabTitleMode as CodeEditorSettings["tabTitleMode"] }),
        })}
      </>
    );
  }

  function renderTerminalSettingsRows() {
    return renderNumberSliderRow({
      id: "tile-terminal:font-size",
      title: "Font size",
      description: "Adjust the font size used by Terminal tiles.",
      value: terminalTileSettings.fontSize,
      min: terminalFontSizeMin,
      max: terminalFontSizeMax,
      step: terminalFontSizeStep,
      suffix: "px",
      ariaLabel: "Terminal font size",
      onChange: (fontSize) => updateTerminalTileSettings({ fontSize }),
    });
  }

  function renderTilesDetail() {
    return (
      <div className="settings-detail-body settings-tiles-body">
        <div className="settings-tile-picker-toolbar">
          <span>Configure tile visibility and settings.</span>
          <button
            className={[
              "settings-integration-refresh-button",
              activeControlId === "tile-picker-refresh" && focusPane === "right"
                ? "settings-button-active"
                : "",
            ].join(" ")}
            type="button"
            onMouseEnter={() => setActiveControlId("tile-picker-refresh")}
            onClick={onRefreshToolAvailabilities}
          >
            Refresh
          </button>
        </div>
        <div className="picker-search-row">
          <input
            ref={searchRef}
            className={[
              "picker-search",
              activeControlId === "tile-picker-search" && focusPane === "right"
                ? "settings-input-active"
                : "",
            ].join(" ")}
            value={tilePickerQuery}
            placeholder="Filter tile types"
            aria-label="Filter tile types"
            onFocus={() => setActiveControlId("tile-picker-search")}
            onChange={(event) => setTilePickerQuery(event.currentTarget.value)}
          />
        </div>
        <div
          className="selector-options settings-tile-picker-options"
          role="listbox"
          aria-label="Tiles"
        >
          {visibleTilePickerItems.map((item) => renderTileSettingsItem(item))}
          {visibleTilePickerItems.length === 0 ? (
            <div className="picker-empty">No matches</div>
          ) : null}
        </div>
      </div>
    );
  }

  function renderTileSettingsItem(item: ConfigurableTilePickerCatalogItem) {
    const active = activeControlId === `tile-picker:${item.id}` && focusPane === "right";
    const expanded = expandedTileSettingsItemId === item.id;
    const configurable = item.kind === "terminal" || item.kind === "code";
    return (
      <div key={item.id} className="settings-tile-config-item">
        <div
          className={["selector-option", active ? "selector-option-active" : ""].join(" ")}
          onMouseEnter={() => setActiveControlId(`tile-picker:${item.id}`)}
        >
          <span className="picker-option-icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="picker-option-copy">
            <span className="picker-option-title">{item.title}</span>
            {availabilityDetailForItem(item) ? (
              <span className="picker-option-detail">{availabilityDetailForItem(item)}</span>
            ) : null}
          </span>
          <span className="settings-row-control settings-tile-config-controls">
            {configurable ? (
              <button
                className="settings-row-action settings-tile-config-button"
                type="button"
                aria-expanded={expanded}
                onClick={() => setExpandedTileSettingsItemId(expanded ? null : item.id)}
              >
                {expanded ? "Hide" : "Configure"}
              </button>
            ) : null}
            <Toggle
              checked={tilePickerVisibility[item.id] ?? item.defaultVisible}
              ariaLabel={`Show ${item.title} in tile picker`}
              onCheckedChange={(visible) => onTilePickerVisibilityChange(item.id, visible)}
            />
          </span>
        </div>
        {expanded ? (
          <div className="settings-tile-config-panel">{renderTileSettingsPanel(item)}</div>
        ) : null}
      </div>
    );
  }

  function renderTileSettingsPanel(item: ConfigurableTilePickerCatalogItem) {
    if (item.kind === "terminal") return renderTerminalSettingsRows();
    if (item.kind === "code") {
      return renderCodeEditorSettingsRows(
        "tile-code-editor",
        codeEditorSettings,
        updateCodeEditorSettings,
      );
    }
    return <div className="settings-detail-empty">No settings for this Tile yet.</div>;
  }

  function renderExtensionsDetail() {
    const extensions = extensionSettings?.extensions ?? [];
    const extensionDiagnostics = new Set(
      extensions.flatMap((extension) => extension.diagnostics.map(extensionDiagnosticKey)),
    );
    const globalDiagnostics = (extensionSettings?.diagnostics ?? []).filter(
      (diagnostic) => !extensionDiagnostics.has(extensionDiagnosticKey(diagnostic)),
    );
    return (
      <div className="settings-detail-body settings-extensions-body">
        <div className="settings-extensions-toolbar">
          <span>
            Inspect loaded Extension Definitions and diagnostics for the current Workspace scope.
          </span>
          <button
            className={[
              "settings-integration-refresh-button",
              activeControlId === "extensions-reload" && focusPane === "right"
                ? "settings-button-active"
                : "",
            ].join(" ")}
            type="button"
            onMouseEnter={() => setActiveControlId("extensions-reload")}
            onClick={onReloadExtensions}
          >
            Refresh
          </button>
        </div>
        {!extensionSettingsLoaded ? (
          <div className="settings-extension-empty">Loading extensions…</div>
        ) : extensions.length === 0 ? (
          <div className="settings-extension-empty">No Extensions found.</div>
        ) : (
          <div className="settings-extension-list">
            {extensions.map((extension) => renderExtensionCard(extension))}
          </div>
        )}
        {extensionSettingsLoaded && globalDiagnostics.length ? (
          <div className="settings-extension-global-diagnostics">
            {globalDiagnostics.map((diagnostic) => (
              <div
                className={`settings-extension-diagnostic settings-extension-diagnostic-${diagnostic.severity}`}
                key={`${diagnostic.sourceKind}:${diagnostic.extensionId}:${diagnostic.message}`}
              >
                {diagnostic.message}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function extensionDiagnosticKey(diagnostic: ExtensionDiagnostic) {
    return `${diagnostic.sourceKind}:${diagnostic.extensionId}:${diagnostic.message}`;
  }

  function renderExtensionCard(extension: ExtensionSettingsEntry) {
    return (
      <article
        className={`settings-extension-card settings-extension-card-${extension.status}`}
        key={`${extension.sourceKind}:${extension.projectId ?? "global"}:${extension.extensionId}:${extension.manifestPath ?? "core"}`}
      >
        <header className="settings-extension-card-header">
          <span className="settings-extension-title">{extension.title}</span>
          <span
            className={`settings-extension-status settings-extension-status-${extension.status}`}
          >
            {extension.status}
          </span>
        </header>
        <dl className="settings-extension-meta">
          <div>
            <dt>Source</dt>
            <dd>{extensionSourceLabel(extension)}</dd>
          </div>
          <div>
            <dt>Extension id</dt>
            <dd>{extension.extensionId}</dd>
          </div>
          {extension.manifestPath ? (
            <div>
              <dt>Manifest</dt>
              <dd title={extension.manifestPath}>{extension.manifestPath}</dd>
            </div>
          ) : null}
          {extension.projectRoot ? (
            <div>
              <dt>Project</dt>
              <dd title={extension.projectRoot}>{extension.projectRoot}</dd>
            </div>
          ) : null}
        </dl>
        <div className="settings-extension-subsection">
          <span className="settings-extension-subtitle">Integration Tiles</span>
          {extension.tiles.length ? (
            <div className="settings-extension-tile-list">
              {extension.tiles.map((tile) => (
                <span
                  className="settings-extension-tile"
                  key={`${tile.integrationId}:${tile.integrationTileId}`}
                >
                  <span>{tile.title}</span>
                  <code>
                    {tile.integrationId}.{tile.integrationTileId}
                  </code>
                </span>
              ))}
            </div>
          ) : (
            <span className="settings-extension-muted">No contributed Integration Tiles.</span>
          )}
        </div>
        <div className="settings-extension-subsection">
          <span className="settings-extension-subtitle">Diagnostics</span>
          {extension.diagnostics.length ? (
            <div className="settings-extension-diagnostics">
              {extension.diagnostics.map((diagnostic) => renderExtensionDiagnostic(diagnostic))}
            </div>
          ) : (
            <span className="settings-extension-muted">No diagnostics.</span>
          )}
        </div>
      </article>
    );
  }

  function renderExtensionDiagnostic(diagnostic: ExtensionDiagnostic) {
    return (
      <div
        className={`settings-extension-diagnostic settings-extension-diagnostic-${diagnostic.severity}`}
        key={`${diagnostic.sourceKind}:${diagnostic.extensionId}:${diagnostic.message}`}
      >
        {diagnostic.message}
      </div>
    );
  }

  function extensionSourceLabel(extension: ExtensionSettingsEntry) {
    if (extension.sourceKind === "core") return "Core Extension Pack";
    if (extension.sourceKind === "global") return "Global Extension";
    return "Project Extension";
  }

  function renderKeybindsDetail() {
    return (
      <div className="settings-detail-body settings-keybinds-body">
        <div className="keyboard-shortcut-groups">
          {keyboardShortcutGroups.map((group) => (
            <section
              className="keyboard-shortcut-group"
              key={group.title}
              aria-label={`${group.title} keybinds`}
            >
              <h3>{group.title}</h3>
              <div className="keyboard-shortcut-list">
                {group.shortcuts.map((shortcut) => {
                  const active = activeControlId === shortcut.id && focusPane === "right";
                  return (
                    <div
                      className={[
                        "keyboard-shortcut-row",
                        active ? "keyboard-shortcut-row-active" : "",
                      ].join(" ")}
                      key={shortcut.id}
                      onMouseEnter={() => setActiveControlId(shortcut.id)}
                    >
                      <span className="keyboard-shortcut-title">{shortcut.title}</span>
                      <span className="keyboard-shortcut-chords">
                        {shortcut.keyChords.map((keys, index) => (
                          <span className="keyboard-shortcut-chord-group" key={keys.join("+")}>
                            {index > 0 ? (
                              <span
                                className="keyboard-shortcut-chord-delimiter"
                                aria-hidden="true"
                              >
                                /
                              </span>
                            ) : null}
                            <KeyChord keys={keys} />
                          </span>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    );
  }

  function renderProjectDetail() {
    if (!selectedProject) {
      return <div className="settings-detail-empty">Select a Project.</div>;
    }

    if (selectedProjectCategory === "overview") return renderProjectOverviewDetail();
    if (selectedProjectCategory === "workspaces") return renderProjectWorkspacesDetail();
    return renderProjectSearchDetail();
  }

  function renderProjectOverviewDetail() {
    if (!selectedProject) return null;

    return (
      <div className="settings-detail-body">
        <div className="settings-project-summary">
          <div>
            <span className="settings-project-summary-label">Name</span>
            <span className="settings-project-summary-value">{selectedProject.name}</span>
          </div>
          <div>
            <span className="settings-project-summary-label">Root</span>
            <span className="settings-project-summary-value" title={selectedProject.root}>
              {selectedProject.root}
            </span>
          </div>
          <div>
            <span className="settings-project-summary-label">Kind</span>
            <span className="settings-project-summary-value">
              {selectedProject.kind === "git" ? "Git-backed Project" : "Plain Project"}
            </span>
          </div>
          <div>
            <span className="settings-project-summary-label">Availability</span>
            <span className="settings-project-summary-value">
              {selectedProject.rootAvailable === false ? "Unavailable" : "Available"}
            </span>
          </div>
        </div>
        {renderProjectDangerZone()}
      </div>
    );
  }

  function renderProjectWorkspacesDetail() {
    if (!selectedProject) return null;

    if (selectedProject.kind !== "git") {
      return (
        <div className="settings-detail-note">
          This Project is not git-backed, so Git workspace settings do not apply.
        </div>
      );
    }

    return (
      <div className="settings-detail-body">
        {renderProjectWorkspaceBranchPrefixControl()}
        {renderWorkspaceCopyFilesControl()}
        {renderToggleRow({
          id: "delete-workspace-branch-on-discard",
          title: "Delete local branch when discarding workspace",
          description:
            "When enabled, discarding a git-backed Workspace also deletes its local Workspace Branch when git says it is safe. Remote branches are never deleted automatically.",
          checked: selectedProject.settings.deleteWorkspaceBranchOnDiscard,
          onChange: () => toggleProjectBranchDiscardPolicy(),
        })}
      </div>
    );
  }

  function renderProjectSearchDetail() {
    if (!selectedProject) return null;

    return (
      <div className="settings-detail-body">
        {renderProjectSearchIncludesControl()}
        {renderProjectSearchExcludesControl()}
      </div>
    );
  }

  function renderProjectDangerZone() {
    if (!selectedProject) return null;

    return (
      <div className="settings-danger-zone" aria-label="Project Danger Zone">
        <span className="settings-section-title">Danger Zone</span>
        {renderActionRow({
          id: "disconnect-project",
          title: "Disconnect Project",
          description: `Remove ${selectedProject.name} from ${APP_NAME} without deleting its Project root or branches.`,
          action:
            pendingProjectRemovalId === selectedProject.id ? "Confirm disconnect" : "Disconnect",
          danger: true,
          onClick: confirmProjectRemoval,
        })}
      </div>
    );
  }

  function renderProjectWorkspaceBranchPrefixControl() {
    if (!selectedProject || selectedProject.kind !== "git") return null;
    const active = activeControlId === "project-workspace-branch-prefix" && focusPane === "right";
    const effectivePrefix = selectedProject.settings.workspaceBranchPrefix ?? workspaceBranchPrefix;

    return (
      <label
        className={["settings-row", active ? "settings-row-active" : ""].join(" ")}
        onClick={() => setActiveControlId("project-workspace-branch-prefix")}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Workspace Branch Prefix</span>
          <span className="settings-row-description">
            Project override. Preview: {workspaceBranchPrefixPreview(effectivePrefix)}
          </span>
        </span>
        <span className="settings-row-control">
          <input
            ref={projectWorkspaceBranchPrefixRef}
            className="settings-text-control"
            value={selectedProject.settings.workspaceBranchPrefix ?? ""}
            placeholder={workspaceBranchPrefix || "none"}
            spellCheck={false}
            onFocus={() => setActiveControlId("project-workspace-branch-prefix")}
            onChange={(event) => updateProjectWorkspaceBranchPrefix(event.currentTarget.value)}
          />
        </span>
      </label>
    );
  }

  function renderWorkspaceCopyFilesControl() {
    if (!selectedProject || selectedProject.kind !== "git") return null;
    const active = activeControlId === "workspace-copy-files" && focusPane === "right";

    return (
      <label
        className={[
          "settings-row",
          "settings-textarea-row",
          active ? "settings-row-active" : "",
        ].join(" ")}
        onClick={() => setActiveControlId("workspace-copy-files")}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Files copied into new Workspaces</span>
          <span className="settings-row-description">
            One Project-root-relative file per line. New git-backed Workspaces copy these files
            before opening, preserving relative paths.
          </span>
        </span>
        <textarea
          ref={workspaceCopyFilesRef}
          className="settings-textarea-control"
          value={(selectedProject.settings.workspaceCopyFiles ?? []).join("\n")}
          placeholder={".env\nconfig/local.json"}
          rows={4}
          spellCheck={false}
          onFocus={() => setActiveControlId("workspace-copy-files")}
          onChange={(event) => updateProjectWorkspaceCopyFiles(event.target.value)}
        />
      </label>
    );
  }

  function renderProjectSearchIncludesControl() {
    if (!selectedProject) return null;
    const active = activeControlId === "project-search-includes" && focusPane === "right";

    return (
      <label
        className={[
          "settings-row",
          "settings-textarea-row",
          active ? "settings-row-active" : "",
        ].join(" ")}
        onClick={() => setActiveControlId("project-search-includes")}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Paths included in project search</span>
          <span className="settings-row-description">
            Optional Project-root-relative paths. Empty searches the whole Project.
          </span>
        </span>
        <textarea
          ref={projectSearchIncludesRef}
          className="settings-textarea-control"
          value={(selectedProject.settings.projectSearchIncludePaths ?? []).join("\n")}
          placeholder={"src\ndocs\nREADME.md"}
          rows={5}
          spellCheck={false}
          onFocus={() => setActiveControlId("project-search-includes")}
          onChange={(event) => updateProjectSearchIncludePaths(event.target.value)}
        />
      </label>
    );
  }

  function renderProjectSearchExcludesControl() {
    if (!selectedProject) return null;
    const active = activeControlId === "project-search-excludes" && focusPane === "right";

    return (
      <label
        className={[
          "settings-row",
          "settings-textarea-row",
          active ? "settings-row-active" : "",
        ].join(" ")}
        onClick={() => setActiveControlId("project-search-excludes")}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Paths excluded from project search</span>
          <span className="settings-row-description">
            One Project-root-relative path per line. Directories exclude their descendants.
          </span>
        </span>
        <textarea
          ref={projectSearchExcludesRef}
          className="settings-textarea-control"
          value={(selectedProject.settings.projectSearchExcludePaths ?? []).join("\n")}
          placeholder={"node_modules\ndist\n.env"}
          rows={5}
          spellCheck={false}
          onFocus={() => setActiveControlId("project-search-excludes")}
          onChange={(event) => updateProjectSearchExcludePaths(event.target.value)}
        />
      </label>
    );
  }

  function renderToggleRow(options: {
    id: string;
    title: string;
    description: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }) {
    const active = activeControlId === options.id && focusPane === "right";
    return (
      <label
        className={["settings-row", active ? "settings-row-active" : ""].join(" ")}
        onMouseEnter={() => setActiveControlId(options.id)}
        onFocus={() => setActiveControlId(options.id)}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">{options.title}</span>
          <span className="settings-row-description">{options.description}</span>
        </span>
        <span className="settings-row-control">
          <Toggle
            checked={options.checked}
            ariaLabel={options.title}
            onCheckedChange={options.onChange}
          />
        </span>
      </label>
    );
  }

  function renderNumberSliderRow(options: {
    id: string;
    title: string;
    description: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
    ariaLabel: string;
    onChange: (value: number) => void;
  }) {
    const active = activeControlId === options.id && focusPane === "right";
    return (
      <label
        className={["settings-row", active ? "settings-row-active" : ""].join(" ")}
        onMouseEnter={() => setActiveControlId(options.id)}
        onFocus={() => setActiveControlId(options.id)}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">{options.title}</span>
          <span className="settings-row-description">{options.description}</span>
        </span>
        <span className="settings-row-control settings-slider-control">
          <Slider
            value={options.value}
            min={options.min}
            max={options.max}
            step={options.step}
            ariaLabel={options.ariaLabel}
            onValueChange={options.onChange}
          />
          <span className="settings-value">
            {options.value}
            {options.suffix}
          </span>
        </span>
      </label>
    );
  }

  function renderSelectRow(options: {
    id: string;
    title: string;
    description: string;
    value: string;
    options: [string, string][];
    onChange: (value: string) => void;
  }) {
    const active = activeControlId === options.id && focusPane === "right";
    return (
      <label
        className={["settings-row", active ? "settings-row-active" : ""].join(" ")}
        onMouseEnter={() => setActiveControlId(options.id)}
        onFocus={() => setActiveControlId(options.id)}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">{options.title}</span>
          <span className="settings-row-description">{options.description}</span>
        </span>
        <span className="settings-row-control">
          <select
            className="settings-select-control"
            value={options.value}
            onFocus={() => setActiveControlId(options.id)}
            onChange={(event) => options.onChange(event.currentTarget.value)}
          >
            {options.options.map(([value, title]) => (
              <option key={value} value={value}>
                {title}
              </option>
            ))}
          </select>
        </span>
      </label>
    );
  }

  function renderActionRow(options: {
    id: string;
    title: string;
    description: string;
    action: string;
    danger?: boolean;
    onClick: () => void;
  }) {
    const active = activeControlId === options.id && focusPane === "right";
    return (
      <button
        className={[
          "settings-row",
          "settings-button-row",
          options.danger ? "settings-danger-row" : "",
          active ? "settings-row-active" : "",
        ].join(" ")}
        type="button"
        onMouseEnter={() => setActiveControlId(options.id)}
        onFocus={() => setActiveControlId(options.id)}
        onClick={options.onClick}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">{options.title}</span>
          <span className="settings-row-description">{options.description}</span>
        </span>
        <span className="settings-row-control">
          <span className={options.danger ? "settings-danger-button" : "settings-row-action"}>
            {options.action}
          </span>
        </span>
      </button>
    );
  }

  function availabilityDetailForItem(item: ConfigurableTilePickerCatalogItem) {
    if (item.kind !== "tool") return null;
    if (!toolAvailabilityLoaded) return "Checking availability…";

    const availability = toolAvailabilityByPickerItemId.get(item.id);
    if (availability?.status === "available") return availability.resolvedPath ?? "Available";
    if (availability?.status === "unavailable") return "Not installed";
    return "Availability unknown";
  }
}
