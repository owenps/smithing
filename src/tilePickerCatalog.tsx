import type { ReactNode } from "react";
import claudeLogoUrl from "./assets/claude-logo.svg";
import geminiLogoUrl from "./assets/gemini-logo.svg";
import openAiLogoUrl from "./assets/openai-logo.svg";
import opencodeLogoUrl from "./assets/opencode-logo.svg";
import piLogoUrl from "./assets/pi-logo.svg";
import {
  createTileDefinitions,
  defaultTileDefinitions,
  integrationTileDefinitionId,
  resolveTileDefinition,
  type TileDefinition,
  type TileDefinitionIcon,
} from "./tileDefinitions";
import type { IntegrationCatalogTile, Tile } from "./types";

type RenderedTileDefinition<T extends TileDefinition = TileDefinition> = T extends unknown
  ? Omit<T, "icon"> & { icon: ReactNode; tileDefinition: T }
  : never;

export type TilePickerCatalogItem = RenderedTileDefinition;
export type ConfigurableTilePickerCatalogItem = TilePickerCatalogItem & {
  defaultVisible: boolean;
};

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

export const defaultConfigurableTilePickerItems = renderTileDefinitions(defaultTileDefinitions);

export type ConfigurableTilePickerItemId = string;
export type TilePickerVisibility = Record<ConfigurableTilePickerItemId, boolean>;

export function createConfigurableTilePickerItems(
  toolTiles: IntegrationCatalogTile[],
): ConfigurableTilePickerCatalogItem[] {
  return renderTileDefinitions(createTileDefinitions(toolTiles));
}

export function createDefaultTilePickerVisibility(
  items: ConfigurableTilePickerCatalogItem[] = defaultConfigurableTilePickerItems,
): TilePickerVisibility {
  return Object.fromEntries(
    items.map((item) => [item.id, item.defaultVisible]),
  ) as TilePickerVisibility;
}

export function getTilePickerItems(
  items: ConfigurableTilePickerCatalogItem[],
  visibility: TilePickerVisibility,
): TilePickerCatalogItem[] {
  return items.filter((item) => visibility[item.id] ?? item.defaultVisible);
}

export function findTilePickerItem(
  items: ConfigurableTilePickerCatalogItem[],
  itemId: string,
): TilePickerCatalogItem | undefined {
  return items.find((item) => item.id === itemId);
}

export function findTilePickerItemForTile(
  items: ConfigurableTilePickerCatalogItem[],
  tile: Tile,
): TilePickerCatalogItem {
  const resolution = resolveTileDefinition(
    items.map((item) => item.tileDefinition),
    tile,
  );
  if (resolution.status === "resolved") return renderTileDefinition(resolution.definition);

  return {
    id: resolution.identity,
    kind: "tool",
    title: resolution.title,
    icon: <span>!</span>,
    extensionId: tile.kind === "tool" ? tile.extensionId : "",
    integrationId: tile.kind === "tool" ? tile.integrationId : "",
    integrationTileId: tile.kind === "tool" ? tile.integrationTileId : "",
    defaultVisible: true,
    tileDefinition: {
      id: resolution.identity,
      kind: "tool",
      title: resolution.title,
      icon: { kind: "text", fallbackText: "!" },
      extensionId: tile.kind === "tool" ? tile.extensionId : "",
      integrationId: tile.kind === "tool" ? tile.integrationId : "",
      integrationTileId: tile.kind === "tool" ? tile.integrationTileId : "",
      defaultVisible: true,
    },
  };
}

export function integrationTilePickerItemId(
  extensionId: string,
  integrationId: string,
  integrationTileId: string,
): string {
  return integrationTileDefinitionId(extensionId, integrationId, integrationTileId);
}

function renderTileDefinitions(definitions: TileDefinition[]): ConfigurableTilePickerCatalogItem[] {
  return definitions.map(renderTileDefinition);
}

function renderTileDefinition(definition: TileDefinition): ConfigurableTilePickerCatalogItem {
  const { icon: iconIdentity, ...item } = definition;
  return {
    ...item,
    icon: iconForTileDefinition(iconIdentity),
    tileDefinition: definition,
  } as ConfigurableTilePickerCatalogItem;
}

function iconForTileDefinition(icon: TileDefinitionIcon): ReactNode {
  if (icon.kind === "builtin") {
    if (icon.key === "workspace") return <span className="workspace-stack-picker-icon" />;
    if (icon.key === "code") return <span className="code-editor-picker-icon" />;
    if (icon.key === "diff") return <span className="diff-picker-icon" />;
  }
  if (icon.kind === "key") return iconByKey[icon.key] ?? textIcon(icon.fallbackText);
  return textIcon(icon.fallbackText);
}

function textIcon(text: string): ReactNode {
  return <span>{text.trim().slice(0, 2) || "?"}</span>;
}
