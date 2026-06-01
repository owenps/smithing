import { useEffect, useRef, useState } from "react";
import { KeyboardShortcutsSettings } from "./KeyboardShortcutsSettings";
import { Slider } from "./Slider";
import { TilePickerSettings } from "./TilePickerSettings";
import { Toggle } from "./Toggle";
import type { ConfigurableTilePickerItemId, TilePickerVisibility } from "./tilePickerCatalog";

const terminalFontSizeMin = 10;
const terminalFontSizeMax = 24;
const terminalFontSizeStep = 1;
type SettingsItemId =
  | "terminal-font-size"
  | "tile-headers"
  | "tile-picker"
  | "keyboard-shortcuts"
  | "debug-layout";
const settingsItems: SettingsItemId[] = [
  "terminal-font-size",
  "tile-headers",
  "tile-picker",
  "keyboard-shortcuts",
  "debug-layout",
];

interface SettingsModalProps {
  debugLayout: boolean;
  onDebugLayoutChange: (enabled: boolean) => void;
  terminalFontSize: number;
  onTerminalFontSizeChange: (fontSize: number) => void;
  tileHeadersVisible: boolean;
  onTileHeadersVisibleChange: (visible: boolean) => void;
  tilePickerVisibility: TilePickerVisibility;
  onTilePickerVisibilityChange: (itemId: ConfigurableTilePickerItemId, visible: boolean) => void;
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
  onTilePickerVisibilityChange,
  onClose,
}: SettingsModalProps) {
  const modalRef = useRef<HTMLElement | null>(null);
  const [activeItemId, setActiveItemId] = useState<SettingsItemId>("terminal-font-size");
  const [tilePickerSettingsOpen, setTilePickerSettingsOpen] = useState(false);
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

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

  const changeKeyboardShortcutsOpen = (open: boolean) => {
    setKeyboardShortcutsOpen(open);
    if (!open) {
      window.requestAnimationFrame(() => modalRef.current?.focus());
    }
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

    if (activeItemId === "keyboard-shortcuts") {
      changeKeyboardShortcutsOpen(!keyboardShortcutsOpen);
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
          if (
            event.key === "Enter" &&
            !(event.target as HTMLElement).closest(".settings-close-button")
          ) {
            event.preventDefault();
            activateItem();
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
                Show title and geometry metadata at the top of each tile.
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
            onActive={() => setActiveItemId("tile-picker")}
            onOpenChange={changeTilePickerSettingsOpen}
            onVisibilityChange={onTilePickerVisibilityChange}
          />
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
              <span className="settings-row-title">Debug layout</span>
              <span className="settings-row-description">
                Show alignment guides while tuning the interface.
              </span>
            </span>
            <span className="settings-row-control">
              <Toggle checked={debugLayout} onCheckedChange={onDebugLayoutChange} />
            </span>
          </label>
        </div>
      </section>
    </div>
  );
}
