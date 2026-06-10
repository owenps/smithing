import {
  DEFAULT_WORKSPACE_TILE_WIDTH,
  GRID_COLUMNS,
  GRID_ROWS,
  type CodeEditorTileState,
  type IntegrationCatalogTile,
  type IntegrationCatalogTileIcon,
  type Tile,
  type TileResumeMetadata,
} from "./types";

export type BuiltInTileDefinitionId = "workspace" | "code" | "diff" | "notepad" | "terminal";
export type TileDefinitionId = BuiltInTileDefinitionId | string;

export type BuiltInTileDefinitionIcon =
  | { kind: "builtin"; key: "workspace"; fallbackText: string }
  | { kind: "builtin"; key: "code"; fallbackText: string }
  | { kind: "builtin"; key: "diff"; fallbackText: string }
  | { kind: "text"; fallbackText: string };

export type TileDefinitionIcon = BuiltInTileDefinitionIcon | IntegrationCatalogTileIcon;

export type TileDefinition =
  | {
      id: TileDefinitionId;
      kind: "terminal" | "workspace" | "code" | "diff" | "notepad";
      title: string;
      defaultVisible: boolean;
      icon: TileDefinitionIcon;
    }
  | {
      id: TileDefinitionId;
      kind: "tool";
      title: string;
      defaultVisible: boolean;
      icon: TileDefinitionIcon;
      extensionId: string;
      integrationId: string;
      integrationTileId: string;
    };

export type TileDefinitionSnapshot =
  | { kind: "terminal"; title: string; resume?: TileResumeMetadata }
  | { kind: "workspace"; title: string }
  | { kind: "code"; title: string; editor?: CodeEditorTileState }
  | { kind: "diff"; title: string }
  | { kind: "notepad"; title: string; note?: string }
  | {
      kind: "tool";
      title: string;
      extensionId: string;
      integrationId: string;
      integrationTileId: string;
      resume?: TileResumeMetadata;
    };

export type TileDefinitionResolution =
  | { status: "resolved"; definition: TileDefinition }
  | { status: "unresolved"; identity: string; title: string };

export const terminalTileDefinition = {
  id: "terminal",
  kind: "terminal",
  title: "Terminal",
  icon: { kind: "text", fallbackText: ">_" },
  defaultVisible: true,
} as const satisfies TileDefinition;

export const workspaceTileDefinition = {
  id: "workspace",
  kind: "workspace",
  title: "Workspaces",
  icon: { kind: "builtin", key: "workspace", fallbackText: "W" },
  defaultVisible: true,
} as const satisfies TileDefinition;

export const codeEditorTileDefinition = {
  id: "code",
  kind: "code",
  title: "Code Editor",
  icon: { kind: "builtin", key: "code", fallbackText: "CE" },
  defaultVisible: true,
} as const satisfies TileDefinition;

export const diffTileDefinition = {
  id: "diff",
  kind: "diff",
  title: "Diff",
  icon: { kind: "builtin", key: "diff", fallbackText: "D" },
  defaultVisible: true,
} as const satisfies TileDefinition;

export const notepadTileDefinition = {
  id: "notepad",
  kind: "notepad",
  title: "Notepad",
  icon: { kind: "text", fallbackText: "N" },
  defaultVisible: true,
} as const satisfies TileDefinition;

export const defaultTileDefinitions: TileDefinition[] = [
  workspaceTileDefinition,
  codeEditorTileDefinition,
  diffTileDefinition,
  notepadTileDefinition,
  terminalTileDefinition,
];

export function createDefaultTiles(): Tile[] {
  const workspaceTileWidth = DEFAULT_WORKSPACE_TILE_WIDTH;

  return [
    createTileFromDefinition(terminalTileDefinition, {
      x: workspaceTileWidth,
      y: 0,
      w: GRID_COLUMNS - workspaceTileWidth,
      h: GRID_ROWS,
    }),
    createTileFromDefinition(workspaceTileDefinition, {
      x: 0,
      y: 0,
      w: workspaceTileWidth,
      h: GRID_ROWS,
    }),
  ];
}

export function createTileDefinitions(toolTiles: IntegrationCatalogTile[]): TileDefinition[] {
  return [
    workspaceTileDefinition,
    codeEditorTileDefinition,
    diffTileDefinition,
    notepadTileDefinition,
    ...toolTiles.map(tileDefinitionFromIntegrationTile),
    terminalTileDefinition,
  ];
}

export function createTileId(): string {
  return `tile-${crypto.randomUUID()}`;
}

export function createTileFromDefinition(
  definition: TileDefinition,
  geometry: Pick<Tile, "x" | "y" | "w" | "h">,
): Tile {
  return createTileFromDefinitionSnapshot(
    tileDefinitionSnapshotForDefinition(definition),
    geometry,
  );
}

export function createTileFromDefinitionSnapshot(
  definition: TileDefinitionSnapshot,
  geometry: Pick<Tile, "x" | "y" | "w" | "h">,
): Tile {
  const base = {
    id: createTileId(),
    title: definition.title,
    ...geometry,
  };

  if (definition.kind === "tool") {
    return {
      ...base,
      kind: "tool",
      extensionId: definition.extensionId,
      integrationId: definition.integrationId,
      integrationTileId: definition.integrationTileId,
      resume: definition.resume,
    };
  }

  if (definition.kind === "workspace") return { ...base, kind: "workspace" };
  if (definition.kind === "code") return { ...base, kind: "code", editor: definition.editor };
  if (definition.kind === "diff") return { ...base, kind: "diff" };
  if (definition.kind === "notepad") return { ...base, kind: "notepad", note: definition.note };
  return { ...base, kind: "terminal", resume: definition.resume };
}

export function tileDefinitionSnapshotForDefinition(
  definition: TileDefinition,
): TileDefinitionSnapshot {
  if (definition.kind === "tool") {
    return {
      kind: "tool",
      title: definition.title,
      extensionId: definition.extensionId,
      integrationId: definition.integrationId,
      integrationTileId: definition.integrationTileId,
    };
  }

  return { kind: definition.kind, title: definition.title };
}

export function tileDefinitionSnapshotForTile(tile: Tile): TileDefinitionSnapshot {
  if (tile.kind === "tool") {
    return {
      kind: "tool",
      title: tile.title,
      extensionId: tile.extensionId,
      integrationId: tile.integrationId,
      integrationTileId: tile.integrationTileId,
      resume: tile.resume,
    };
  }

  if (tile.kind === "workspace") return { kind: "workspace", title: tile.title };
  if (tile.kind === "code") return { kind: "code", title: tile.title, editor: tile.editor };
  if (tile.kind === "diff") return { kind: "diff", title: tile.title };
  if (tile.kind === "notepad") return { kind: "notepad", title: tile.title, note: tile.note };
  return { kind: "terminal", title: tile.title, resume: tile.resume };
}

export function resolveTileDefinition(
  definitions: TileDefinition[],
  tile: Tile,
): TileDefinitionResolution {
  const definition = findTileDefinitionForTile(definitions, tile);
  if (definition) return { status: "resolved", definition };

  return {
    status: "unresolved",
    identity: tileDefinitionIdentity(tile),
    title: tile.title || "Unavailable Integration Tile",
  };
}

export function findTileDefinition(
  definitions: TileDefinition[],
  definitionId: string,
): TileDefinition | undefined {
  return definitions.find((definition) => definition.id === definitionId);
}

export function findTileDefinitionForTile(
  definitions: TileDefinition[],
  tile: Tile,
): TileDefinition | undefined {
  if (tile.kind !== "tool") return definitions.find((definition) => definition.kind === tile.kind);

  return definitions.find(
    (definition) =>
      definition.kind === "tool" &&
      definition.extensionId === tile.extensionId &&
      definition.integrationId === tile.integrationId &&
      definition.integrationTileId === tile.integrationTileId,
  );
}

export function tileDefinitionIdentity(tile: Tile): string {
  if (tile.kind !== "tool") return tile.kind;
  return integrationTileDefinitionId(tile.extensionId, tile.integrationId, tile.integrationTileId);
}

export function integrationTileDefinitionId(
  extensionId: string,
  integrationId: string,
  integrationTileId: string,
): string {
  return `${extensionId}:${integrationId}.${integrationTileId}`;
}

function tileDefinitionFromIntegrationTile(tile: IntegrationCatalogTile): TileDefinition {
  return {
    id: integrationTileDefinitionId(tile.extensionId, tile.integrationId, tile.integrationTileId),
    kind: "tool",
    title: tile.title,
    icon: tile.icon ?? { kind: "text", fallbackText: fallbackIconText(tile.title) },
    extensionId: tile.extensionId,
    integrationId: tile.integrationId,
    integrationTileId: tile.integrationTileId,
    defaultVisible: tile.defaultVisible,
  };
}

function fallbackIconText(title: string): string {
  return (
    title
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}
