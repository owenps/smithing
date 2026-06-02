import type { ReactNode } from "react";
import integrationCatalogData from "./shared/integrationCatalog.json";
import claudeLogoUrl from "./assets/claude-logo.svg";
import geminiLogoUrl from "./assets/gemini-logo.svg";
import openAiLogoUrl from "./assets/openai-logo.svg";
import opencodeLogoUrl from "./assets/opencode-logo.svg";
import piLogoUrl from "./assets/pi-logo.svg";
import type { Tile } from "./types";

interface IntegrationCatalog {
  integrations: IntegrationCatalogIntegration[];
}

interface IntegrationCatalogIntegration {
  id: string;
  title: string;
  tiles: IntegrationCatalogTile[];
}

interface IntegrationCatalogTile {
  id: string;
  title: string;
  kind: "tool";
  defaultVisible: boolean;
  iconKey: string;
}

export type TilePickerCatalogItem =
  | {
      id: string;
      kind: "terminal";
      title: string;
      icon: ReactNode;
    }
  | {
      id: string;
      kind: "tool";
      title: string;
      icon: ReactNode;
      integrationId: string;
      integrationTileId: string;
    };

type ConfigurableTilePickerCatalogItem = TilePickerCatalogItem & {
  defaultVisible: boolean;
};

const integrationCatalog = integrationCatalogData as IntegrationCatalog;

const iconByKey: Record<string, ReactNode> = {
  claude: (
    <img className="picker-option-logo picker-option-logo-plain" src={claudeLogoUrl} alt="" />
  ),
  codex: (
    <img className="picker-option-logo picker-option-logo-openai" src={openAiLogoUrl} alt="" />
  ),
  gemini: (
    <img className="picker-option-logo picker-option-logo-plain" src={geminiLogoUrl} alt="" />
  ),
  opencode: <img className="picker-option-logo" src={opencodeLogoUrl} alt="" />,
  pi: <img className="picker-option-logo" src={piLogoUrl} alt="" />,
};

const terminalTilePickerItem = {
  id: "terminal",
  kind: "terminal",
  title: "Terminal",
  icon: <span>&gt;_</span>,
  defaultVisible: true,
} as const satisfies ConfigurableTilePickerCatalogItem;

const integrationTilePickerItems: ConfigurableTilePickerCatalogItem[] =
  integrationCatalog.integrations.flatMap((integration) =>
    integration.tiles.map((tile) => ({
      id: integrationTilePickerItemId(integration.id, tile.id),
      kind: tile.kind,
      title: tile.title,
      icon: iconByKey[tile.iconKey] ?? <span>{integration.title.slice(0, 1)}</span>,
      integrationId: integration.id,
      integrationTileId: tile.id,
      defaultVisible: tile.defaultVisible,
    })),
  );

export const configurableTilePickerItems: ConfigurableTilePickerCatalogItem[] = [
  ...integrationTilePickerItems,
  terminalTilePickerItem,
];

export type ConfigurableTilePickerItemId = string;
export type TilePickerVisibility = Record<ConfigurableTilePickerItemId, boolean>;

export function createDefaultTilePickerVisibility(): TilePickerVisibility {
  return Object.fromEntries(
    configurableTilePickerItems.map((item) => [item.id, item.defaultVisible]),
  ) as TilePickerVisibility;
}

export function getTilePickerItems(visibility: TilePickerVisibility): TilePickerCatalogItem[] {
  return configurableTilePickerItems.filter((item) => visibility[item.id]);
}

export function findTilePickerItem(itemId: string): TilePickerCatalogItem | undefined {
  return configurableTilePickerItems.find((item) => item.id === itemId);
}

export function findTilePickerItemForTile(tile: Tile): TilePickerCatalogItem {
  if (tile.kind === "terminal") return terminalTilePickerItem;

  return (
    configurableTilePickerItems.find(
      (item) =>
        item.kind === "tool" &&
        item.integrationId === tile.integrationId &&
        item.integrationTileId === tile.integrationTileId,
    ) ?? terminalTilePickerItem
  );
}

function integrationTilePickerItemId(integrationId: string, integrationTileId: string): string {
  return `${integrationId}.${integrationTileId}`;
}
