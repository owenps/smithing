import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "./appConstants";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { Slider } from "./Slider";
import { TilePickerSettings } from "./TilePickerSettings";
import { Toggle } from "./Toggle";
import type { ConfigurableTilePickerItemId, TilePickerVisibility } from "./tilePickerCatalog";
import type { RegisteredProject, ToolAvailability } from "./types";

const terminalFontSizeMin = 10;
const terminalFontSizeMax = 24;
const terminalFontSizeStep = 1;
type SettingsItemId =
  | "terminal-font-size"
  | "tile-headers"
  | "tile-picker"
  | "projects"
  | "keyboard-shortcuts"
  | "debug-layout"
  | "reset-application";
const settingsItems: SettingsItemId[] = [
  "terminal-font-size",
  "tile-headers",
  "tile-picker",
  "projects",
  "keyboard-shortcuts",
  "debug-layout",
  "reset-application",
];

interface SettingsModalProps {
  debugLayout: boolean;
  onDebugLayoutChange: (enabled: boolean) => void;
  terminalFontSize: number;
  onTerminalFontSizeChange: (fontSize: number) => void;
  tileHeadersVisible: boolean;
  onTileHeadersVisibleChange: (visible: boolean) => void;
  tilePickerVisibility: TilePickerVisibility;
  toolAvailabilityByPickerItemId: Map<string, ToolAvailability>;
  toolAvailabilityLoaded: boolean;
  onTilePickerVisibilityChange: (itemId: ConfigurableTilePickerItemId, visible: boolean) => void;
  onRefreshToolAvailabilities: () => void;
  projects: RegisteredProject[];
  projectsLoaded: boolean;
  currentProjectRoot: string | null;
  onRefreshProjects: () => void;
  onRemoveProject: (projectId: string) => void;
  onResetApplication: () => void;
  onClose: () => void;
}

export function SettingsModal({
  debugLayout,
  onDebugLayoutChange,
  terminalFontSize,
  onTerminalFontSizeChange,
  tileHeadersVisible,
  onTileHeadersVisibleChange,
  tilePickerVisibility,
  toolAvailabilityByPickerItemId,
  toolAvailabilityLoaded,
  onTilePickerVisibilityChange,
  onRefreshToolAvailabilities,
  projects,
  projectsLoaded,
  currentProjectRoot,
  onRefreshProjects,
  onRemoveProject,
  onResetApplication,
  onClose,
}: SettingsModalProps) {
  const modalRef = useRef<HTMLElement | null>(null);
  const projectsPanelRef = useRef<HTMLDivElement | null>(null);
  const projectRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>("terminal-font-size");
  const [tilePickerSettingsOpen, setTilePickerSettingsOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);
  const [projectPendingRemovalId, setProjectPendingRemovalId] = useState<string | null>(null);
  const [resetConfirmationVisible, setResetConfirmationVisible] = useState(false);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!projectsOpen) return;
    setActiveProjectId((currentProjectId) => {
      if (currentProjectId && projects.some((project) => project.id === currentProjectId)) {
        return currentProjectId;
      }
      return projects[0]?.id ?? null;
    });
  }, [projects, projectsOpen]);

  useEffect(() => {
    if (!projectsOpen || !activeProjectId) return;
    projectRowRefs.current[activeProjectId]?.scrollIntoView({ block: "nearest" });
  }, [activeProjectId, projectsOpen]);

  const moveActiveItem = (delta: number) => {
    const currentIndex = settingsItems.indexOf(activeItemId);
    const nextIndex = (currentIndex + delta + settingsItems.length) % settingsItems.length;
    setActiveItemId(settingsItems[nextIndex]);
    modalRef.current?.focus();
  };

  const changeTilePickerSettingsOpen = (open: boolean) => {
    setTilePickerSettingsOpen(open);
    if (!open) {
      window.requestAnimationFrame(() => modalRef.current?.focus());
    }
  };

  const changeProjectsOpen = (open: boolean) => {
    setProjectsOpen(open);
    if (open) {
      onRefreshProjects();
      window.requestAnimationFrame(() => projectsPanelRef.current?.focus());
    } else {
      setActiveProjectId(null);
      setProjectPendingRemovalId(null);
      window.requestAnimationFrame(() => modalRef.current?.focus());
    }
  };

  const changeKeyboardShortcutsOpen = (open: boolean) => {
    setKeyboardShortcutsOpen(open);
    if (!open) {
      window.requestAnimationFrame(() => modalRef.current?.focus());
    }
  };

  const confirmProjectRemoval = (projectId: string) => {
    if (projectPendingRemovalId !== projectId) {
      setProjectPendingRemovalId(projectId);
      return;
    }

    setProjectPendingRemovalId(null);
    onRemoveProject(projectId);
  };

  const moveActiveProject = (delta: number) => {
    if (projects.length === 0) return;
    const currentIndex = projects.findIndex((project) => project.id === activeProjectId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + delta + projects.length) % projects.length;
    setActiveProjectId(projects[nextIndex].id);
  };

  const moveActiveProjectTo = (index: number) => {
    const project = projects[index];
    if (!project) return;
    setActiveProjectId(project.id);
  };

  const confirmActiveProjectRemoval = () => {
    if (!activeProjectId) return;
    confirmProjectRemoval(activeProjectId);
  };

  const confirmResetApplication = () => {
    if (!resetConfirmationVisible) {
      setResetConfirmationVisible(true);
      return;
    }

    onResetApplication();
  };

  const activateItem = () => {
    if (activeItemId === "debug-layout") {
      onDebugLayoutChange(!debugLayout);
      return;
    }

    if (activeItemId === "tile-headers") {
      onTileHeadersVisibleChange(!tileHeadersVisible);
      return;
    }

    if (activeItemId === "tile-picker") {
      changeTilePickerSettingsOpen(!tilePickerSettingsOpen);
      return;
    }

    if (activeItemId === "projects") {
      changeProjectsOpen(!projectsOpen);
      return;
    }

    if (activeItemId === "keyboard-shortcuts") {
      changeKeyboardShortcutsOpen(!keyboardShortcutsOpen);
      return;
    }

    if (activeItemId === "reset-application") {
      confirmResetApplication();
    }
  };

  const changeTerminalFontSize = (fontSize: number) => {
    onTerminalFontSizeChange(
      Math.min(terminalFontSizeMax, Math.max(terminalFontSizeMin, fontSize)),
    );
  };

  const adjustActiveItem = (delta: number) => {
    if (activeItemId === "terminal-font-size") {
      changeTerminalFontSize(terminalFontSize + delta * terminalFontSizeStep);
      return;
    }

    if (activeItemId === "tile-picker") {
      changeTilePickerSettingsOpen(delta > 0);
      return;
    }

    if (activeItemId === "projects") {
      changeProjectsOpen(delta > 0);
      return;
    }

    if (activeItemId === "keyboard-shortcuts") {
      changeKeyboardShortcutsOpen(delta > 0);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section
        ref={modalRef}
        className="settings-modal"
        aria-label="Settings"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          if (event.key === "ArrowDown") {
            event.preventDefault();
            moveActiveItem(1);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            moveActiveItem(-1);
            return;
          }
          if (event.key === "ArrowLeft") {
            event.preventDefault();
            adjustActiveItem(-1);
            return;
          }
          if (event.key === "ArrowRight") {
            event.preventDefault();
            adjustActiveItem(1);
            return;
          }
          if (event.key === "Enter") {
            const interactiveTarget = (event.target as HTMLElement).closest(
              ".settings-close-button, .settings-project-remove-button, .settings-project-refresh-button, .settings-integration-refresh-button",
            );
            if (!interactiveTarget) {
              event.preventDefault();
              activateItem();
            }
          }
        }}
        tabIndex={-1}
      >
        <header className="settings-modal-header">
          <h2>Settings</h2>
          <button
            className="settings-close-button"
            type="button"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </header>
        <div className="settings-modal-body">
          <label
            className={[
              "settings-row",
              activeItemId === "terminal-font-size" ? "settings-row-active" : "",
            ].join(" ")}
            onMouseEnter={() => setActiveItemId("terminal-font-size")}
            onFocus={() => setActiveItemId("terminal-font-size")}
          >
            <span className="settings-row-copy">
              <span className="settings-row-title">Terminal font size</span>
              <span className="settings-row-description">
                Adjust the text size used inside terminal tiles.
              </span>
            </span>
            <span className="settings-row-control settings-slider-control">
              <Slider
                value={terminalFontSize}
                min={terminalFontSizeMin}
                max={terminalFontSizeMax}
                step={terminalFontSizeStep}
                ariaLabel="Terminal font size"
                onValueChange={changeTerminalFontSize}
              />
              <span className="settings-value">{terminalFontSize}px</span>
            </span>
          </label>
          <label
            className={[
              "settings-row",
              activeItemId === "tile-headers" ? "settings-row-active" : "",
            ].join(" ")}
            onMouseEnter={() => setActiveItemId("tile-headers")}
            onFocus={() => setActiveItemId("tile-headers")}
          >
            <span className="settings-row-copy">
              <span className="settings-row-title">Tile headers</span>
              <span className="settings-row-description">
                Show tile titles at the top of each tile.
              </span>
            </span>
            <span className="settings-row-control">
              <Toggle checked={tileHeadersVisible} onCheckedChange={onTileHeadersVisibleChange} />
            </span>
          </label>
          <TilePickerSettings
            active={activeItemId === "tile-picker"}
            open={tilePickerSettingsOpen}
            visibility={tilePickerVisibility}
            toolAvailabilityByPickerItemId={toolAvailabilityByPickerItemId}
            toolAvailabilityLoaded={toolAvailabilityLoaded}
            onActive={() => setActiveItemId("tile-picker")}
            onOpenChange={changeTilePickerSettingsOpen}
            onVisibilityChange={onTilePickerVisibilityChange}
            onRefreshToolAvailabilities={onRefreshToolAvailabilities}
          />
          <div className="settings-section">
            <button
              className={[
                "settings-row",
                "settings-button-row",
                activeItemId === "projects" ? "settings-row-active" : "",
              ].join(" ")}
              type="button"
              aria-expanded={projectsOpen}
              onClick={() => changeProjectsOpen(!projectsOpen)}
              onMouseEnter={() => setActiveItemId("projects")}
              onFocus={() => setActiveItemId("projects")}
            >
              <span className="settings-row-copy">
                <span className="settings-row-title">Projects</span>
                <span className="settings-row-description">
                  Disconnect registered projects and remove their Fluidity-managed workspaces.
                </span>
              </span>
              <span className="settings-row-control settings-row-action">
                {projectsOpen ? "Hide" : "Configure"}
              </span>
            </button>
            {projectsOpen ? (
              <div
                ref={projectsPanelRef}
                className="settings-inline-panel"
                aria-label="Registered projects"
                aria-activedescendant={
                  activeProjectId ? `settings-project-${activeProjectId}` : undefined
                }
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Escape") {
                    event.preventDefault();
                    changeProjectsOpen(false);
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveActiveProject(1);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveActiveProject(-1);
                    return;
                  }
                  if (event.key === "PageDown") {
                    event.preventDefault();
                    moveActiveProject(5);
                    return;
                  }
                  if (event.key === "PageUp") {
                    event.preventDefault();
                    moveActiveProject(-5);
                    return;
                  }
                  if (event.key === "Home") {
                    event.preventDefault();
                    moveActiveProjectTo(0);
                    return;
                  }
                  if (event.key === "End") {
                    event.preventDefault();
                    moveActiveProjectTo(projects.length - 1);
                    return;
                  }
                  if (event.key === "Enter") {
                    const interactiveTarget = (event.target as HTMLElement).closest(
                      ".settings-project-remove-button, .settings-project-refresh-button",
                    );
                    if (!interactiveTarget) {
                      event.preventDefault();
                      confirmActiveProjectRemoval();
                    }
                  }
                }}
                tabIndex={-1}
              >
                <div className="settings-inline-panel-header settings-projects-header">
                  <span>
                    Disconnecting keeps project folders and branches, but removes managed
                    workspaces.
                  </span>
                  <button
                    className="settings-project-refresh-button"
                    type="button"
                    onClick={onRefreshProjects}
                  >
                    Refresh
                  </button>
                </div>
                <div className="settings-projects-list">
                  {!projectsLoaded ? (
                    <div className="settings-project-empty">Loading projects…</div>
                  ) : projects.length === 0 ? (
                    <div className="settings-project-empty">No projects registered.</div>
                  ) : (
                    projects.map((project) => {
                      const activeProject = activeProjectId === project.id;
                      const isCurrentProject = project.root === currentProjectRoot;
                      const confirming = projectPendingRemovalId === project.id;

                      return (
                        <div
                          id={`settings-project-${project.id}`}
                          key={project.id}
                          ref={(element) => {
                            projectRowRefs.current[project.id] = element;
                          }}
                          className={[
                            "settings-project-row",
                            activeProject ? "settings-project-row-active" : "",
                          ].join(" ")}
                          aria-current={activeProject ? "true" : undefined}
                          onMouseEnter={() => setActiveProjectId(project.id)}
                        >
                          <span className="settings-project-copy">
                            <span className="settings-project-name">
                              {project.name}
                              {isCurrentProject ? (
                                <span className="settings-project-current">Current</span>
                              ) : null}
                            </span>
                            <span className="settings-project-root">{project.root}</span>
                          </span>
                          <button
                            className="settings-project-remove-button"
                            type="button"
                            onFocus={() => setActiveProjectId(project.id)}
                            onClick={() => confirmProjectRemoval(project.id)}
                          >
                            {confirming ? "Confirm" : "Disconnect…"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
          <KeyboardShortcutsSettings
            active={activeItemId === "keyboard-shortcuts"}
            open={keyboardShortcutsOpen}
            onActive={() => setActiveItemId("keyboard-shortcuts")}
            onOpenChange={changeKeyboardShortcutsOpen}
          />
          <label
            className={[
              "settings-row",
              activeItemId === "debug-layout" ? "settings-row-active" : "",
            ].join(" ")}
            onMouseEnter={() => setActiveItemId("debug-layout")}
            onFocus={() => setActiveItemId("debug-layout")}
          >
            <span className="settings-row-copy">
              <span className="settings-row-title">Debug mode</span>
              <span className="settings-row-description">Show development-only diagnostics.</span>
            </span>
            <span className="settings-row-control">
              <Toggle checked={debugLayout} onCheckedChange={onDebugLayoutChange} />
            </span>
          </label>
          <div className="settings-danger-zone" aria-label="Danger Zone">
            <span className="settings-section-title">Danger Zone</span>
            <button
              className={[
                "settings-row",
                "settings-button-row",
                "settings-danger-row",
                activeItemId === "reset-application" ? "settings-row-active" : "",
              ].join(" ")}
              type="button"
              onClick={confirmResetApplication}
              onMouseEnter={() => setActiveItemId("reset-application")}
              onFocus={() => setActiveItemId("reset-application")}
            >
              <span className="settings-row-copy">
                <span className="settings-row-title">Reset {APP_NAME}</span>
                <span className="settings-row-description">
                  Clear all local data and reset to system defaults.
                </span>
              </span>
              <span className="settings-row-control">
                <span className="settings-danger-button">
                  {resetConfirmationVisible ? "Confirm" : "Reset…"}
                </span>
              </span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
