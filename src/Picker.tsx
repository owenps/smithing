import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyChord } from "./KeyCap";

export interface PickerItem {
  id: string;
  title: string;
  icon: ReactNode;
  disabled?: boolean;
}

export interface PickerSelectOptions {
  splitDirection: "right" | "down";
}

interface PickerProps {
  title: string;
  items: PickerItem[];
  onSelect: (item: PickerItem, options: PickerSelectOptions) => void;
  onClose: () => void;
}

export function Picker({ title, items, onSelect, onClose }: PickerProps) {
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) => item.title.toLowerCase().includes(normalizedQuery));
  }, [items, query]);
  const enabledItems = useMemo(() => visibleItems.filter((item) => !item.disabled), [visibleItems]);
  const [activeItemId, setActiveItemId] = useState<string | null>(enabledItems[0]?.id ?? null);
  const rootRef = useRef<HTMLElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    if (activeItemId && enabledItems.some((item) => item.id === activeItemId)) return;
    setActiveItemId(enabledItems[0]?.id ?? null);
  }, [activeItemId, enabledItems]);

  const selectItem = (
    item: PickerItem,
    options: PickerSelectOptions = { splitDirection: "right" },
  ) => {
    if (item.disabled) return;
    onSelect(item, options);
  };

  const moveActiveItem = (delta: number) => {
    if (enabledItems.length === 0) return;
    const currentIndex = enabledItems.findIndex((item) => item.id === activeItemId);
    const nextIndex =
      currentIndex === -1 ? 0 : (currentIndex + delta + enabledItems.length) % enabledItems.length;
    setActiveItemId(enabledItems[nextIndex].id);
  };

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <section
        ref={rootRef}
        className="picker"
        aria-label={title}
        tabIndex={-1}
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
          if (event.key === "Enter" && activeItemId) {
            event.preventDefault();
            const item = enabledItems.find((candidate) => candidate.id === activeItemId);
            if (item) selectItem(item, { splitDirection: event.shiftKey ? "down" : "right" });
          }
        }}
      >
        <div className="picker-search-row">
          <input
            ref={searchRef}
            className="picker-search"
            value={query}
            placeholder={title}
            aria-label={title}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <div className="picker-options" role="listbox" aria-label={title}>
          {visibleItems.map((item) => {
            const active = item.id === activeItemId;
            return (
              <button
                key={item.id}
                className={["picker-option", active ? "picker-option-active" : ""].join(" ")}
                type="button"
                disabled={item.disabled}
                role="option"
                aria-selected={active}
                onMouseEnter={() => !item.disabled && setActiveItemId(item.id)}
                onClick={() => selectItem(item)}
              >
                <span className="picker-option-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="picker-option-title">{item.title}</span>
              </button>
            );
          })}
          {visibleItems.length === 0 ? <div className="picker-empty">No matches</div> : null}
        </div>
        <div className="picker-footer" aria-label="Tile picker shortcuts">
          <span className="picker-shortcut-hint">
            Split right <KeyChord keys={["Enter"]} size="compact" />
          </span>
          <span className="picker-shortcut-separator" aria-hidden="true">
            •
          </span>
          <span className="picker-shortcut-hint">
            Split down <KeyChord keys={["⇧", "Enter"]} size="compact" />
          </span>
        </div>
      </section>
    </div>
  );
}
