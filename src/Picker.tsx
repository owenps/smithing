import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { KeyChord } from "./KeyCap";

export interface PickerItem {
  id: string;
  title: string;
  icon: ReactNode;
  detail?: ReactNode;
  searchText?: string;
  disabled?: boolean;
}

export interface PickerSelectOptions {
  splitDirection: "right" | "down";
}

interface PickerProps {
  title: string;
  items: PickerItem[];
  maxVisibleItems?: number;
  footer?: ReactNode;
  onSelect: (item: PickerItem, options: PickerSelectOptions) => void;
  onClose: () => void;
}

export function PickerShortcutHint({ label, keys }: { label: string; keys: string[] }) {
  return (
    <span className="picker-shortcut-hint">
      {label} <KeyChord keys={keys} size="compact" />
    </span>
  );
}

export function PickerShortcutSeparator() {
  return (
    <span className="picker-shortcut-separator" aria-hidden="true">
      •
    </span>
  );
}

function pickerItemScore(item: PickerItem, query: string): number | null {
  const haystack = `${item.title} ${item.searchText ?? ""}`.toLowerCase();
  const title = item.title.toLowerCase();
  if (title.startsWith(query)) return 0;
  const titleIndex = title.indexOf(query);
  if (titleIndex >= 0) return 10 + titleIndex;
  const haystackIndex = haystack.indexOf(query);
  if (haystackIndex >= 0) return 100 + haystackIndex;

  let score = 200;
  let cursor = 0;
  for (const character of query) {
    const next = haystack.indexOf(character, cursor);
    if (next === -1) return null;
    score += next - cursor;
    cursor = next + 1;
  }
  return score;
}

export function Picker({ title, items, maxVisibleItems, footer, onSelect, onClose }: PickerProps) {
  const [query, setQuery] = useState("");
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return maxVisibleItems ? items.slice(0, maxVisibleItems) : items;
    const matches = items
      .map((item) => ({ item, score: pickerItemScore(item, normalizedQuery) }))
      .filter((result): result is { item: PickerItem; score: number } => result.score !== null)
      .sort((left, right) => left.score - right.score)
      .map((result) => result.item);
    return maxVisibleItems ? matches.slice(0, maxVisibleItems) : matches;
  }, [items, maxVisibleItems, query]);
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
          if (event.key === "ArrowDown" || (event.ctrlKey && event.key === "n")) {
            event.preventDefault();
            moveActiveItem(1);
            return;
          }
          if (event.key === "ArrowUp" || (event.ctrlKey && event.key === "p")) {
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
                <span className="picker-option-copy">
                  <span className="picker-option-title">{item.title}</span>
                  {item.detail ? <span className="picker-option-detail">{item.detail}</span> : null}
                </span>
              </button>
            );
          })}
          {visibleItems.length === 0 ? <div className="picker-empty">No matches</div> : null}
        </div>
        {footer ? (
          <div className="picker-footer" aria-label="Picker shortcuts">
            {footer}
          </div>
        ) : null}
      </section>
    </div>
  );
}
