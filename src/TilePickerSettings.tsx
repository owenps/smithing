import { useEffect, useMemo, useRef, useState } from "react";
import { Toggle } from "./Toggle";
import {
  configurableTilePickerItems,
  type ConfigurableTilePickerItemId,
  type TilePickerVisibility,
} from "./tilePickerCatalog";

function orderTilePickerItems(visibility: TilePickerVisibility) {
  return [...configurableTilePickerItems].sort((a, b) => {
    const visibilityOrder = Number(visibility[b.id]) - Number(visibility[a.id]);
    if (visibilityOrder !== 0) return visibilityOrder;
    return a.title.localeCompare(b.title);
  });
}

interface TilePickerSettingsProps {
  active: boolean;
  open: boolean;
  visibility: TilePickerVisibility;
  onActive: () => void;
  onOpenChange: (open: boolean) => void;
  onVisibilityChange: (itemId: ConfigurableTilePickerItemId, visible: boolean) => void;
}

export function TilePickerSettings({
  active,
  open,
  visibility,
  onActive,
  onOpenChange,
  onVisibilityChange,
}: TilePickerSettingsProps) {
  const [query, setQuery] = useState("");
  const [activeOptionId, setActiveOptionId] = useState<ConfigurableTilePickerItemId>(
    configurableTilePickerItems[0].id,
  );
  const searchRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef<Partial<Record<ConfigurableTilePickerItemId, HTMLLabelElement | null>>>(
    {},
  );
  const visibleCount = configurableTilePickerItems.filter((item) => visibility[item.id]).length;
  const summary = `${visibleCount} of ${configurableTilePickerItems.length} tile types visible`;
  const [orderedItems, setOrderedItems] = useState(() => orderTilePickerItems(visibility));

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return orderedItems;
    return orderedItems.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  }, [orderedItems, query]);

  useEffect(() => {
    if (!open) return;

    const nextOrderedItems = orderTilePickerItems(visibility);
    setOrderedItems(nextOrderedItems);
    setQuery("");
    setActiveOptionId(nextOrderedItems[0].id);
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  useEffect(() => {
    if (visibleItems.some((item) => item.id === activeOptionId)) return;
    setActiveOptionId(visibleItems[0]?.id ?? configurableTilePickerItems[0].id);
  }, [activeOptionId, visibleItems]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeOptionId]?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId, open]);

  const moveActiveOption = (delta: number) => {
    if (visibleItems.length === 0) return;
    const currentIndex = visibleItems.findIndex((item) => item.id === activeOptionId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + delta + visibleItems.length) % visibleItems.length;
    setActiveOptionId(visibleItems[nextIndex].id);
  };

  const toggleActiveOption = () => {
    const item = visibleItems.find((candidate) => candidate.id === activeOptionId);
    if (!item) return;
    onVisibilityChange(item.id, !visibility[item.id]);
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
          <span className="settings-row-title">Tile picker</span>
          <span className="settings-row-description">{summary}</span>
        </span>
        <span className="settings-row-control settings-row-action">
          {open ? "Hide" : "Configure"}
        </span>
      </button>

      {open ? (
        <section
          className="settings-inline-panel"
          aria-label="Tile picker settings"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              onOpenChange(false);
              return;
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActiveOption(1);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActiveOption(-1);
              return;
            }
            if (event.key === "Enter" && !(event.target as HTMLElement).closest(".toggle-input")) {
              event.preventDefault();
              toggleActiveOption();
            }
          }}
        >
          <div className="settings-inline-panel-header">
            Choose which tiles appear in the picker.
          </div>
          <div className="picker-search-row">
            <input
              ref={searchRef}
              className="picker-search"
              value={query}
              placeholder="Filter tile types"
              aria-label="Filter tile types"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
          <div className="selector-options" role="listbox" aria-label="Tile picker items">
            {visibleItems.map((item) => {
              const optionActive = item.id === activeOptionId;
              return (
                <label
                  key={item.id}
                  ref={(element) => {
                    optionRefs.current[item.id] = element;
                  }}
                  className={["selector-option", optionActive ? "selector-option-active" : ""].join(
                    " ",
                  )}
                  onMouseEnter={() => setActiveOptionId(item.id)}
                >
                  <span className="picker-option-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="picker-option-title">{item.title}</span>
                  <span className="settings-row-control">
                    <Toggle
                      checked={visibility[item.id]}
                      ariaLabel={`Show ${item.title} in tile picker`}
                      onCheckedChange={(visible) => onVisibilityChange(item.id, visible)}
                    />
                  </span>
                </label>
              );
            })}
            {visibleItems.length === 0 ? <div className="picker-empty">No matches</div> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
