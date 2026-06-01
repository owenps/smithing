import {
  GRID_COLUMNS,
  GRID_ROWS,
  MIN_TILE_HEIGHT,
  MIN_TILE_WIDTH,
  type Direction,
  type Tile,
} from "./types";

export function createDefaultTiles(): Tile[] {
  return [
    {
      id: createTileId(),
      kind: "terminal",
      title: "Terminal",
      x: 0,
      y: 0,
      w: GRID_COLUMNS,
      h: GRID_ROWS,
    },
  ];
}

export function createTileId(): string {
  return `tile-${crypto.randomUUID()}`;
}

export function findTile(tiles: Tile[], tileId: string | null): Tile | undefined {
  if (!tileId) return undefined;
  return tiles.find((tile) => tile.id === tileId);
}

export function focusTileInDirection(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): string | null {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return focusedTileId;

  const focusedCenterX = focused.x + focused.w / 2;
  const focusedCenterY = focused.y + focused.h / 2;

  const candidates = tiles
    .filter((tile) => tile.id !== focused.id)
    .map((tile) => {
      const centerX = tile.x + tile.w / 2;
      const centerY = tile.y + tile.h / 2;

      switch (direction) {
        case "left":
          if (tile.x + tile.w > focused.x) return null;
          return {
            tile,
            primary: focused.x - (tile.x + tile.w),
            secondary: Math.abs(centerY - focusedCenterY),
          };
        case "right":
          if (tile.x < focused.x + focused.w) return null;
          return {
            tile,
            primary: tile.x - (focused.x + focused.w),
            secondary: Math.abs(centerY - focusedCenterY),
          };
        case "up":
          if (tile.y + tile.h > focused.y) return null;
          return {
            tile,
            primary: focused.y - (tile.y + tile.h),
            secondary: Math.abs(centerX - focusedCenterX),
          };
        case "down":
          if (tile.y < focused.y + focused.h) return null;
          return {
            tile,
            primary: tile.y - (focused.y + focused.h),
            secondary: Math.abs(centerX - focusedCenterX),
          };
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((a, b) => a.primary - b.primary || a.secondary - b.secondary);

  return candidates[0]?.tile.id ?? focusedTileId;
}

export function moveTile(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): Tile[] {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return tiles;

  const moved: Tile = {
    ...focused,
    x: focused.x + (direction === "right" ? 1 : direction === "left" ? -1 : 0),
    y: focused.y + (direction === "down" ? 1 : direction === "up" ? -1 : 0),
  };

  if (
    !isValidPlacement(
      moved,
      tiles.filter((tile) => tile.id !== focused.id),
    )
  ) {
    return tiles;
  }

  return tiles.map((tile) => (tile.id === focused.id ? moved : tile));
}

export function resizeTile(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): Tile[] {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return tiles;

  const resized: Tile = {
    ...focused,
    w: focused.w + (direction === "right" ? 1 : direction === "left" ? -1 : 0),
    h: focused.h + (direction === "down" ? 1 : direction === "up" ? -1 : 0),
  };

  if (
    !isValidPlacement(
      resized,
      tiles.filter((tile) => tile.id !== focused.id),
    )
  ) {
    return tiles;
  }

  return tiles.map((tile) => (tile.id === focused.id ? resized : tile));
}

export type TileSplitDirection = Extract<Direction, "right" | "down">;

export function splitFocusedTile(
  tiles: Tile[],
  focusedTileId: string | null,
  newTileOptions: Pick<Tile, "title"> & Partial<Pick<Tile, "initialCommand">> = {
    title: "Terminal",
  },
  direction?: TileSplitDirection,
): { tiles: Tile[]; focusedTileId: string | null } {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return { tiles, focusedTileId };

  const splitTileOptions = {
    kind: "terminal" as const,
    title: newTileOptions.title,
    initialCommand: newTileOptions.initialCommand,
  };

  if (direction === "right") {
    if (focused.w >= MIN_TILE_WIDTH * 2) return splitTileRight(tiles, focused, splitTileOptions);
    return { tiles, focusedTileId };
  }

  if (direction === "down") {
    if (focused.h >= MIN_TILE_HEIGHT * 2) return splitTileDown(tiles, focused, splitTileOptions);
    return { tiles, focusedTileId };
  }

  if (focused.w >= MIN_TILE_WIDTH * 2) {
    return splitTileRight(tiles, focused, splitTileOptions);
  }

  if (focused.h >= MIN_TILE_HEIGHT * 2) {
    return splitTileDown(tiles, focused, splitTileOptions);
  }

  return { tiles, focusedTileId };
}

export function splitFocusedTileInDirection(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: TileSplitDirection,
): { tiles: Tile[]; focusedTileId: string | null } {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return { tiles, focusedTileId };

  const newTileOptions = {
    kind: focused.kind,
    title: focused.title,
    initialCommand: focused.initialCommand,
  };

  if (direction === "right" && focused.w >= MIN_TILE_WIDTH * 2) {
    return splitTileRight(tiles, focused, newTileOptions);
  }

  if (direction === "down" && focused.h >= MIN_TILE_HEIGHT * 2) {
    return splitTileDown(tiles, focused, newTileOptions);
  }

  return { tiles, focusedTileId };
}

function splitTileRight(
  tiles: Tile[],
  focused: Tile,
  newTileOptions: Pick<Tile, "kind" | "title"> & Partial<Pick<Tile, "initialCommand">>,
): { tiles: Tile[]; focusedTileId: string | null } {
  const leftWidth = Math.floor(focused.w / 2);
  const rightWidth = focused.w - leftWidth;
  const newTile: Tile = {
    id: createTileId(),
    kind: newTileOptions.kind,
    title: newTileOptions.title,
    initialCommand: newTileOptions.initialCommand,
    x: focused.x + leftWidth,
    y: focused.y,
    w: rightWidth,
    h: focused.h,
  };
  const updatedFocused = { ...focused, w: leftWidth };
  return {
    tiles: tiles.map((tile) => (tile.id === focused.id ? updatedFocused : tile)).concat(newTile),
    focusedTileId: newTile.id,
  };
}

function splitTileDown(
  tiles: Tile[],
  focused: Tile,
  newTileOptions: Pick<Tile, "kind" | "title"> & Partial<Pick<Tile, "initialCommand">>,
): { tiles: Tile[]; focusedTileId: string | null } {
  const topHeight = Math.floor(focused.h / 2);
  const bottomHeight = focused.h - topHeight;
  const newTile: Tile = {
    id: createTileId(),
    kind: newTileOptions.kind,
    title: newTileOptions.title,
    initialCommand: newTileOptions.initialCommand,
    x: focused.x,
    y: focused.y + topHeight,
    w: focused.w,
    h: bottomHeight,
  };
  const updatedFocused = { ...focused, h: topHeight };
  return {
    tiles: tiles.map((tile) => (tile.id === focused.id ? updatedFocused : tile)).concat(newTile),
    focusedTileId: newTile.id,
  };
}

export function closeTile(
  tiles: Tile[],
  focusedTileId: string | null,
): { tiles: Tile[]; focusedTileId: string | null } {
  const closingTile = findTile(tiles, focusedTileId);
  if (!closingTile) return { tiles, focusedTileId };

  const remainingTiles = tiles.filter((tile) => tile.id !== closingTile.id);
  const expansion = closeTileExpansion(remainingTiles, closingTile);
  if (expansion) return expansion;

  return {
    tiles: remainingTiles,
    focusedTileId: remainingTiles[0]?.id ?? null,
  };
}

type TileCloseExpansion = { tiles: Tile[]; focusedTileId: string | null };

type TileCloseExpansionPlan = {
  expandedTileIds: string[];
  updateTile: (tile: Tile) => Tile;
};

function closeTileExpansion(tiles: Tile[], closingTile: Tile): TileCloseExpansion | null {
  const plans = [
    expandTilesFromLeft(tiles, closingTile),
    expandTilesFromRight(tiles, closingTile),
    expandTilesFromAbove(tiles, closingTile),
    expandTilesFromBelow(tiles, closingTile),
  ].filter((plan): plan is TileCloseExpansionPlan => plan !== null);

  const plan = plans.sort((a, b) => a.expandedTileIds.length - b.expandedTileIds.length)[0];
  if (!plan) return null;

  const expandedTileIds = new Set(plan.expandedTileIds);
  const nextTiles = tiles.map((tile) =>
    expandedTileIds.has(tile.id) ? plan.updateTile(tile) : tile,
  );
  if (!isValidLayout(nextTiles)) return null;

  return {
    tiles: nextTiles,
    focusedTileId: plan.expandedTileIds[0] ?? nextTiles[0]?.id ?? null,
  };
}

function expandTilesFromLeft(tiles: Tile[], closingTile: Tile): TileCloseExpansionPlan | null {
  const candidates = tiles.filter(
    (tile) =>
      tile.x + tile.w === closingTile.x &&
      tile.y >= closingTile.y &&
      tile.y + tile.h <= closingTile.y + closingTile.h,
  );
  if (!tilesCoverSpan(candidates, "y", closingTile.y, closingTile.y + closingTile.h)) return null;
  return {
    expandedTileIds: sortedTileIds(candidates, "y"),
    updateTile: (tile) => ({ ...tile, w: tile.w + closingTile.w }),
  };
}

function expandTilesFromRight(tiles: Tile[], closingTile: Tile): TileCloseExpansionPlan | null {
  const candidates = tiles.filter(
    (tile) =>
      tile.x === closingTile.x + closingTile.w &&
      tile.y >= closingTile.y &&
      tile.y + tile.h <= closingTile.y + closingTile.h,
  );
  if (!tilesCoverSpan(candidates, "y", closingTile.y, closingTile.y + closingTile.h)) return null;
  return {
    expandedTileIds: sortedTileIds(candidates, "y"),
    updateTile: (tile) => ({ ...tile, x: closingTile.x, w: tile.w + closingTile.w }),
  };
}

function expandTilesFromAbove(tiles: Tile[], closingTile: Tile): TileCloseExpansionPlan | null {
  const candidates = tiles.filter(
    (tile) =>
      tile.y + tile.h === closingTile.y &&
      tile.x >= closingTile.x &&
      tile.x + tile.w <= closingTile.x + closingTile.w,
  );
  if (!tilesCoverSpan(candidates, "x", closingTile.x, closingTile.x + closingTile.w)) return null;
  return {
    expandedTileIds: sortedTileIds(candidates, "x"),
    updateTile: (tile) => ({ ...tile, h: tile.h + closingTile.h }),
  };
}

function expandTilesFromBelow(tiles: Tile[], closingTile: Tile): TileCloseExpansionPlan | null {
  const candidates = tiles.filter(
    (tile) =>
      tile.y === closingTile.y + closingTile.h &&
      tile.x >= closingTile.x &&
      tile.x + tile.w <= closingTile.x + closingTile.w,
  );
  if (!tilesCoverSpan(candidates, "x", closingTile.x, closingTile.x + closingTile.w)) return null;
  return {
    expandedTileIds: sortedTileIds(candidates, "x"),
    updateTile: (tile) => ({ ...tile, y: closingTile.y, h: tile.h + closingTile.h }),
  };
}

function sortedTileIds(tiles: Tile[], axis: "x" | "y"): string[] {
  return [...tiles].sort((a, b) => a[axis] - b[axis]).map((tile) => tile.id);
}

function tilesCoverSpan(tiles: Tile[], axis: "x" | "y", start: number, end: number): boolean {
  if (tiles.length === 0) return false;

  let cursor = start;
  for (const tile of [...tiles].sort((a, b) => a[axis] - b[axis])) {
    if (tile[axis] !== cursor) return false;
    cursor = tile[axis] + (axis === "x" ? tile.w : tile.h);
  }

  return cursor === end;
}

function isValidLayout(tiles: Tile[]): boolean {
  return tiles.every((tile, index) => isValidPlacement(tile, tiles.slice(index + 1)));
}

function isValidPlacement(tile: Tile, otherTiles: Tile[]): boolean {
  if (tile.x < 0 || tile.y < 0) return false;
  if (tile.w < MIN_TILE_WIDTH || tile.h < MIN_TILE_HEIGHT) return false;
  if (tile.x + tile.w > GRID_COLUMNS || tile.y + tile.h > GRID_ROWS) return false;
  return otherTiles.every((other) => !overlaps(tile, other));
}

function overlaps(a: Tile, b: Tile): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
