import { useEffect, useMemo, useRef, useState } from "react";
import { keyboardShortcutGroups } from "./commands";
import { KeyChord } from "./KeyCap";

interface KeyboardShortcutsSettingsProps {
  active: boolean;
  open: boolean;
  onActive: () => void;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardShortcutsSettings({
  active,
  open,
  onActive,
  onOpenChange,
}: KeyboardShortcutsSettingsProps) {
  const shortcuts = useMemo(() => keyboardShortcutGroups.flatMap((group) => group.shortcuts), []);
  const firstShortcutId = shortcuts[0]?.id ?? "";
  const [activeShortcutId, setActiveShortcutId] = useState(firstShortcutId);
  const panelRef = useRef<HTMLElement | null>(null);
  const shortcutRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    if (!open) return;
    setActiveShortcutId(firstShortcutId);
    window.requestAnimationFrame(() => panelRef.current?.focus());
  }, [firstShortcutId, open]);

  useEffect(() => {
    if (shortcuts.some((shortcut) => shortcut.id === activeShortcutId)) return;
    setActiveShortcutId(firstShortcutId);
  }, [activeShortcutId, firstShortcutId, shortcuts]);

  useEffect(() => {
    if (!open) return;
    shortcutRefs.current[activeShortcutId]?.scrollIntoView({ block: "nearest" });
  }, [activeShortcutId, open]);

  const moveActiveShortcut = (delta: number) => {
    if (shortcuts.length === 0) return;
    const currentIndex = shortcuts.findIndex((shortcut) => shortcut.id === activeShortcutId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + delta + shortcuts.length) % shortcuts.length;
    setActiveShortcutId(shortcuts[nextIndex].id);
  };

  const moveActiveShortcutTo = (index: number) => {
    const shortcut = shortcuts[index];
    if (!shortcut) return;
    setActiveShortcutId(shortcut.id);
  };

  return (
    <div className="settings-section">
      <button
        className={[
          "settings-row",
          "settings-button-row",
          active ? "settings-row-active" : "",
        ].join(" ")}
        type="button"
        aria-expanded={open}
        onMouseEnter={onActive}
        onFocus={onActive}
        onClick={() => onOpenChange(!open)}
      >
        <span className="settings-row-copy">
          <span className="settings-row-title">Keyboard shortcuts</span>
          <span className="settings-row-description">View the current app-wide shortcuts.</span>
        </span>
        <span className="settings-row-control settings-row-action">{open ? "Hide" : "View"}</span>
      </button>

      {open ? (
        <section
          ref={panelRef}
          className="settings-inline-panel"
          aria-label="Keyboard shortcuts"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              onOpenChange(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActiveShortcut(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActiveShortcut(-1);
              return;
            }
            if (event.key === "PageDown") {
              event.preventDefault();
              moveActiveShortcut(5);
              return;
            }
            if (event.key === "PageUp") {
              event.preventDefault();
              moveActiveShortcut(-5);
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              moveActiveShortcutTo(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              moveActiveShortcutTo(shortcuts.length - 1);
            }
          }}
          tabIndex={-1}
        >
          <div className="settings-inline-panel-header">
            Shortcuts are currently fixed. Rebinding will come later.
          </div>
          <div className="keyboard-shortcut-groups">
            {keyboardShortcutGroups.map((group) => (
              <section
                className="keyboard-shortcut-group"
                key={group.title}
                aria-label={`${group.title} shortcuts`}
              >
                <h3>{group.title}</h3>
                <div className="keyboard-shortcut-list">
                  {group.shortcuts.map((shortcut) => {
                    const shortcutActive = shortcut.id === activeShortcutId;
                    return (
                      <div
                        id={`keyboard-shortcut-${shortcut.id}`}
                        ref={(element) => {
                          shortcutRefs.current[shortcut.id] = element;
                        }}
                        className={[
                          "keyboard-shortcut-row",
                          shortcutActive ? "keyboard-shortcut-row-active" : "",
                        ].join(" ")}
                        key={shortcut.id}
                        aria-current={shortcutActive ? "true" : undefined}
                        onMouseEnter={() => setActiveShortcutId(shortcut.id)}
                      >
                        <span className="keyboard-shortcut-title">{shortcut.title}</span>
                        <KeyChord keys={shortcut.keys} />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
