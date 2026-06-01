import type { ReactNode } from "react";
import claudeLogoUrl from "./assets/claude-logo.svg";
import geminiLogoUrl from "./assets/gemini-logo.svg";
import openAiLogoUrl from "./assets/openai-logo.svg";
import opencodeLogoUrl from "./assets/opencode-logo.svg";
import piLogoUrl from "./assets/pi-logo.svg";

export interface TilePickerCatalogItem {
  id: string;
  title: string;
  icon: ReactNode;
  initialCommand?: string;
}

const terminalTilePickerItem: TilePickerCatalogItem = {
  id: "terminal",
  title: "Terminal",
  icon: <span>&gt;_</span>,
};

export const configurableTilePickerItems = [
  {
    id: "pi",
    title: "Pi",
    icon: <img className="picker-option-logo" src={piLogoUrl} alt="" />,
    initialCommand: "pi",
    defaultVisible: false,
  },
  {
    id: "claude",
    title: "Claude",
    icon: (
      <img className="picker-option-logo picker-option-logo-plain" src={claudeLogoUrl} alt="" />
    ),
    initialCommand: "claude",
    defaultVisible: false,
  },
  {
    id: "codex",
    title: "Codex",
    icon: (
      <img className="picker-option-logo picker-option-logo-openai" src={openAiLogoUrl} alt="" />
    ),
    initialCommand: "codex",
    defaultVisible: false,
  },
  {
    id: "opencode",
    title: "OpenCode",
    icon: <img className="picker-option-logo" src={opencodeLogoUrl} alt="" />,
    initialCommand: "opencode",
    defaultVisible: false,
  },
  {
    id: "gemini",
    title: "Gemini",
    icon: (
      <img className="picker-option-logo picker-option-logo-plain" src={geminiLogoUrl} alt="" />
    ),
    initialCommand: "gemini",
    defaultVisible: false,
  },
] as const;

export type ConfigurableTilePickerItemId = (typeof configurableTilePickerItems)[number]["id"];
export type TilePickerVisibility = Record<ConfigurableTilePickerItemId, boolean>;

export function createDefaultTilePickerVisibility(): TilePickerVisibility {
  return Object.fromEntries(
    configurableTilePickerItems.map((item) => [item.id, item.defaultVisible]),
  ) as TilePickerVisibility;
}

export function getTilePickerItems(visibility: TilePickerVisibility): TilePickerCatalogItem[] {
  return [
    terminalTilePickerItem,
    ...configurableTilePickerItems.filter((item) => visibility[item.id]),
  ];
}

export function findTilePickerItem(itemId: string): TilePickerCatalogItem | undefined {
  if (itemId === terminalTilePickerItem.id) return terminalTilePickerItem;
  return configurableTilePickerItems.find((item) => item.id === itemId);
}

export function findTilePickerItemForTile(tile: {
  title: string;
  initialCommand?: string;
}): TilePickerCatalogItem {
  if (!tile.initialCommand) return terminalTilePickerItem;

  return (
    configurableTilePickerItems.find((item) => item.initialCommand === tile.initialCommand) ??
    terminalTilePickerItem
  );
}
