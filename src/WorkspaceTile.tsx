import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenWorkspaceSummary } from "./types";

interface WorkspaceTileProps {
  workspaces: OpenWorkspaceSummary[];
  currentWorkspaceId: string | null;
  active: boolean;
  showPaths: boolean;
  deletionPositiveStatColors: boolean;
  onSwitchWorkspace: (workspaceId: string) => void;
  onDiscardWorkspace: (workspaceId: string) => void;
}

interface WorkspaceProjectGroup {
  projectId: string;
  projectName: string;
  workspaces: OpenWorkspaceSummary[];
}

export function WorkspaceTile({
  workspaces,
  currentWorkspaceId,
  active,
  showPaths,
  deletionPositiveStatColors,
  onSwitchWorkspace,
  onDiscardWorkspace,
}: WorkspaceTileProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const discardButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const groups = useMemo(() => groupWorkspacesByProject(workspaces), [workspaces]);
  const workspaceShortcutHints = useMemo(
    () => workspaceShortcutHintsById(workspaces),
    [workspaces],
  );
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    currentWorkspaceId ?? workspaces[0]?.id ?? null,
  );

  useEffect(() => {
    setSelectedWorkspaceId(currentWorkspaceId ?? workspaces[0]?.id ?? null);
  }, [currentWorkspaceId, workspaces]);

  useEffect(() => {
    if (active) {
      rootRef.current?.focus();
    }
  }, [active]);

  useEffect(() => {
    let shortcutHintTimer: number | null = null;

    const clearShortcutHintTimer = () => {
      if (shortcutHintTimer === null) return;
      window.clearTimeout(shortcutHintTimer);
      shortcutHintTimer = null;
    };

    const hideShortcutHints = () => {
      clearShortcutHintTimer();
      setShowShortcutHints(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey && event.key !== "Meta") return;
      if (shortcutHintTimer !== null) return;
      shortcutHintTimer = window.setTimeout(() => {
        shortcutHintTimer = null;
        setShowShortcutHints(true);
      }, 1000);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Meta" || !event.metaKey) {
        hideShortcutHints();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        hideShortcutHints();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", hideShortcutHints);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      hideShortcutHints();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", hideShortcutHints);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (
      selectedWorkspaceId &&
      workspaces.some((workspace) => workspace.id === selectedWorkspaceId)
    ) {
      return;
    }
    setSelectedWorkspaceId(currentWorkspaceId ?? workspaces[0]?.id ?? null);
  }, [currentWorkspaceId, selectedWorkspaceId, workspaces]);

  const selectedWorkspace = workspaces.find((workspace) => workspace.id === selectedWorkspaceId);
  const selectedWorkspaceIndex = workspaces.findIndex(
    (workspace) => workspace.id === selectedWorkspaceId,
  );

  const focusWorkspaceList = () => {
    rootRef.current?.focus();
  };

  const selectWorkspaceAtIndex = (index: number) => {
    const workspace = workspaces[index];
    if (!workspace) return;
    setSelectedWorkspaceId(workspace.id);
    window.requestAnimationFrame(focusWorkspaceList);
  };

  const moveSelection = (delta: number) => {
    if (workspaces.length === 0) return;
    const currentIndex = workspaces.findIndex((workspace) => workspace.id === selectedWorkspaceId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + delta + workspaces.length) % workspaces.length;
    setSelectedWorkspaceId(workspaces[nextIndex].id);
  };

  const focusSelectedDiscardButton = () => {
    if (!selectedWorkspaceId) return;
    discardButtonRefs.current.get(selectedWorkspaceId)?.focus();
  };

  return (
    <div
      ref={rootRef}
      className={[
        "workspace-stack-tile",
        deletionPositiveStatColors ? "workspace-stack-deletion-positive" : "",
      ].join(" ")}
      tabIndex={0}
      role="listbox"
      aria-label="Open workspaces"
      aria-activedescendant={
        selectedWorkspaceId ? workspaceOptionId(selectedWorkspaceId) : undefined
      }
      onKeyDown={(event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const navigationKey = event.key.toLowerCase();
        const plainKey = !event.metaKey && !event.altKey && !event.ctrlKey;
        if (target?.closest(".workspace-stack-discard")) {
          if (event.key === "Enter" || event.key === " ") {
            return;
          }
          if (event.key === "ArrowLeft" || (plainKey && navigationKey === "h")) {
            event.preventDefault();
            focusWorkspaceList();
            return;
          }
          if (
            (event.key === "ArrowUp" || (plainKey && navigationKey === "k")) &&
            selectedWorkspaceIndex > 0
          ) {
            event.preventDefault();
            selectWorkspaceAtIndex(selectedWorkspaceIndex - 1);
            return;
          }
          if (
            (event.key === "ArrowDown" || (plainKey && navigationKey === "j")) &&
            selectedWorkspaceIndex >= 0 &&
            selectedWorkspaceIndex < workspaces.length - 1
          ) {
            event.preventDefault();
            selectWorkspaceAtIndex(selectedWorkspaceIndex + 1);
            return;
          }
        }

        if (event.key === "ArrowDown" || (plainKey && navigationKey === "j")) {
          event.preventDefault();
          moveSelection(1);
          return;
        }
        if (event.key === "ArrowUp" || (plainKey && navigationKey === "k")) {
          event.preventDefault();
          moveSelection(-1);
          return;
        }
        if (event.key === "ArrowRight" || (plainKey && navigationKey === "l")) {
          event.preventDefault();
          focusSelectedDiscardButton();
          return;
        }
        if (event.key === "Enter" && selectedWorkspaceId) {
          event.preventDefault();
          onSwitchWorkspace(selectedWorkspaceId);
          return;
        }
        if (
          (event.key === "Backspace" || event.key === "Delete") &&
          selectedWorkspace?.discardable
        ) {
          event.preventDefault();
          onDiscardWorkspace(selectedWorkspace.id);
        }
      }}
    >
      {groups.length > 0 ? (
        groups.map((group) => (
          <section className="workspace-stack-project" key={group.projectId}>
            <h3>{group.projectName}</h3>
            <div className="workspace-stack-list">
              {group.workspaces.map((workspace) => {
                const current = workspace.id === currentWorkspaceId;
                const selected = workspace.id === selectedWorkspaceId;
                const hasStats = Boolean(workspace.linesAdded || workspace.linesDeleted);
                const shortcutHint = workspaceShortcutHints.get(workspace.id);

                return (
                  <div
                    key={workspace.id}
                    className={[
                      "workspace-stack-row",
                      current ? "workspace-stack-row-current" : "",
                      selected ? "workspace-stack-row-selected" : "",
                    ].join(" ")}
                    onMouseEnter={() => setSelectedWorkspaceId(workspace.id)}
                  >
                    <button
                      id={workspaceOptionId(workspace.id)}
                      className="workspace-stack-switch"
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onFocus={() => setSelectedWorkspaceId(workspace.id)}
                      onClick={() => onSwitchWorkspace(workspace.id)}
                    >
                      <span className="workspace-stack-name-row">
                        <span className="workspace-stack-name">{workspace.name}</span>
                      </span>
                      {showPaths ? (
                        <span className="workspace-stack-root">{workspace.root}</span>
                      ) : null}
                    </button>
                    {hasStats ? (
                      <span
                        className="workspace-stack-stats"
                        aria-label={workspaceStatsLabel(workspace)}
                      >
                        <span className="workspace-stack-stat-added">
                          +{workspace.linesAdded ?? 0}
                        </span>
                        <span className="workspace-stack-stat-deleted">
                          -{workspace.linesDeleted ?? 0}
                        </span>
                      </span>
                    ) : null}
                    {showShortcutHints && shortcutHint ? (
                      <span className="workspace-stack-shortcut-hint" aria-hidden="true">
                        {shortcutHint}
                      </span>
                    ) : workspace.discardable ? (
                      <button
                        ref={(element) => {
                          if (element) {
                            discardButtonRefs.current.set(workspace.id, element);
                          } else {
                            discardButtonRefs.current.delete(workspace.id);
                          }
                        }}
                        className="workspace-stack-discard"
                        type="button"
                        aria-label="Discard workspace"
                        data-tooltip={discardTooltipForWorkspace(current)}
                        onFocus={() => setSelectedWorkspaceId(workspace.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          onDiscardWorkspace(workspace.id);
                        }}
                      >
                        <span className="workspace-stack-discard-icon" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="workspace-stack-empty">No open workspaces.</div>
      )}
    </div>
  );
}

function groupWorkspacesByProject(workspaces: OpenWorkspaceSummary[]): WorkspaceProjectGroup[] {
  const groups: WorkspaceProjectGroup[] = [];
  const groupByProjectId = new Map<string, WorkspaceProjectGroup>();

  workspaces.forEach((workspace) => {
    let group = groupByProjectId.get(workspace.projectId);
    if (!group) {
      group = {
        projectId: workspace.projectId,
        projectName: workspace.projectName,
        workspaces: [],
      };
      groupByProjectId.set(workspace.projectId, group);
      groups.push(group);
    }

    group.workspaces.push(workspace);
  });

  return groups;
}

function workspaceOptionId(workspaceId: string): string {
  return `workspace-option-${workspaceId}`;
}

function workspaceShortcutHintsById(workspaces: OpenWorkspaceSummary[]): Map<string, string> {
  return new Map(workspaces.slice(0, 9).map((workspace, index) => [workspace.id, `⌘${index + 1}`]));
}

function discardTooltipForWorkspace(current: boolean): string {
  return current ? "Discard workspace · ⌘⇧⌫" : "Discard workspace";
}

function workspaceStatsLabel(workspace: OpenWorkspaceSummary): string {
  return `${workspace.linesAdded ?? 0} lines added, ${workspace.linesDeleted ?? 0} lines deleted`;
}
