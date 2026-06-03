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

  const directCandidate = bestFocusCandidate(tiles, focused, direction, false);
  if (directCandidate) return directCandidate.id;

  return bestFocusCandidate(tiles, focused, direction, true)?.id ?? focusedTileId;
}

type TileFocusCandidate = {
  tile: Tile;
  primary: number;
  overlapPenalty: number;
  secondary: number;
  tertiary: number;
};

function bestFocusCandidate(
  tiles: Tile[],
  focused: Tile,
  direction: Direction,
  wrap: boolean,
): Tile | null {
  const candidates = tiles
    .filter((tile) => tile.id !== focused.id)
    .map((tile) => focusCandidate(tile, focused, direction, wrap))
    .filter((candidate): candidate is TileFocusCandidate => candidate !== null)
    .sort(
      (a, b) =>
        a.primary - b.primary ||
        a.overlapPenalty - b.overlapPenalty ||
        a.secondary - b.secondary ||
        a.tertiary - b.tertiary,
    );

  return candidates[0]?.tile ?? null;
}

function focusCandidate(
  tile: Tile,
  focused: Tile,
  direction: Direction,
  wrap: boolean,
): TileFocusCandidate | null {
  const horizontal = direction === "left" || direction === "right";
  const overlap = horizontal
    ? spanOverlap(tile.y, tile.y + tile.h, focused.y, focused.y + focused.h)
    : spanOverlap(tile.x, tile.x + tile.w, focused.x, focused.x + focused.w);
  const centerDistance = horizontal
    ? Math.abs(tile.y + tile.h / 2 - (focused.y + focused.h / 2))
    : Math.abs(tile.x + tile.w / 2 - (focused.x + focused.w / 2));

  const primary = focusCandidatePrimary(tile, focused, direction, wrap);
  if (primary === null) return null;

  return {
    tile,
    primary,
    overlapPenalty: overlap > 0 ? 0 : 1,
    secondary: overlap > 0 ? -overlap : centerDistance,
    tertiary: centerDistance,
  };
}

function focusCandidatePrimary(
  tile: Tile,
  focused: Tile,
  direction: Direction,
  wrap: boolean,
): number | null {
  switch (direction) {
    case "left":
      if (!wrap) return tile.x + tile.w <= focused.x ? focused.x - (tile.x + tile.w) : null;
      return -(tile.x + tile.w);
    case "right":
      if (!wrap) return tile.x >= focused.x + focused.w ? tile.x - (focused.x + focused.w) : null;
      return tile.x;
    case "up":
      if (!wrap) return tile.y + tile.h <= focused.y ? focused.y - (tile.y + tile.h) : null;
      return -(tile.y + tile.h);
    case "down":
      if (!wrap) return tile.y >= focused.y + focused.h ? tile.y - (focused.y + focused.h) : null;
      return tile.y;
  }
}

function spanOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
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

export function canResizeTile(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): boolean {
  return createTileResizePlan(tiles, focusedTileId, direction) !== null;
}

export function resizeTile(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): Tile[] {
  const plan = createTileResizePlan(tiles, focusedTileId, direction);
  if (!plan) return tiles;
  return tiles.map(plan.updateTile);
}

type TileResizePlan = {
  updateTile: (tile: Tile) => Tile;
};

function createTileResizePlan(
  tiles: Tile[],
  focusedTileId: string | null,
  direction: Direction,
): TileResizePlan | null {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return null;

  return (
    growFocusedInDirection(tiles, focused, direction) ??
    shrinkFocusedOppositeDirection(tiles, focused, direction)
  );
}

function growFocusedInDirection(
  tiles: Tile[],
  focused: Tile,
  direction: Direction,
): TileResizePlan | null {
  switch (direction) {
    case "left":
      return growFocusedLeftEdge(tiles, focused);
    case "right":
      return growFocusedRightEdge(tiles, focused);
    case "up":
      return growFocusedTopEdge(tiles, focused);
    case "down":
      return growFocusedBottomEdge(tiles, focused);
  }
}

function shrinkFocusedOppositeDirection(
  tiles: Tile[],
  focused: Tile,
  direction: Direction,
): TileResizePlan | null {
  switch (direction) {
    case "left":
      return shrinkFocusedRightEdge(tiles, focused);
    case "right":
      return shrinkFocusedLeftEdge(tiles, focused);
    case "up":
      return shrinkFocusedBottomEdge(tiles, focused);
    case "down":
      return shrinkFocusedTopEdge(tiles, focused);
  }
}

function growFocusedLeftEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.x <= 0) return null;

  const candidates = tilesAlongLeftEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "y", focused.y, focused.y + focused.h)) return null;
  if (candidates.some((tile) => tile.w <= MIN_TILE_WIDTH)) return null;

  const shrinkingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, x: tile.x - 1, w: tile.w + 1 };
    if (shrinkingTileIds.has(tile.id)) return { ...tile, w: tile.w - 1 };
    return tile;
  });
}

function growFocusedRightEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.x + focused.w >= GRID_COLUMNS) return null;

  const candidates = tilesAlongRightEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "y", focused.y, focused.y + focused.h)) return null;
  if (candidates.some((tile) => tile.w <= MIN_TILE_WIDTH)) return null;

  const shrinkingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, w: tile.w + 1 };
    if (shrinkingTileIds.has(tile.id)) return { ...tile, x: tile.x + 1, w: tile.w - 1 };
    return tile;
  });
}

function growFocusedTopEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.y <= 0) return null;

  const candidates = tilesAlongTopEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "x", focused.x, focused.x + focused.w)) return null;
  if (candidates.some((tile) => tile.h <= MIN_TILE_HEIGHT)) return null;

  const shrinkingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, y: tile.y - 1, h: tile.h + 1 };
    if (shrinkingTileIds.has(tile.id)) return { ...tile, h: tile.h - 1 };
    return tile;
  });
}

function growFocusedBottomEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.y + focused.h >= GRID_ROWS) return null;

  const candidates = tilesAlongBottomEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "x", focused.x, focused.x + focused.w)) return null;
  if (candidates.some((tile) => tile.h <= MIN_TILE_HEIGHT)) return null;

  const shrinkingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, h: tile.h + 1 };
    if (shrinkingTileIds.has(tile.id)) return { ...tile, y: tile.y + 1, h: tile.h - 1 };
    return tile;
  });
}

function shrinkFocusedLeftEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.w <= MIN_TILE_WIDTH) return null;

  const candidates = tilesAlongLeftEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "y", focused.y, focused.y + focused.h)) return null;

  const expandingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, x: tile.x + 1, w: tile.w - 1 };
    if (expandingTileIds.has(tile.id)) return { ...tile, w: tile.w + 1 };
    return tile;
  });
}

function shrinkFocusedRightEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.w <= MIN_TILE_WIDTH) return null;

  const candidates = tilesAlongRightEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "y", focused.y, focused.y + focused.h)) return null;

  const expandingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, w: tile.w - 1 };
    if (expandingTileIds.has(tile.id)) return { ...tile, x: tile.x - 1, w: tile.w + 1 };
    return tile;
  });
}

function shrinkFocusedTopEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.h <= MIN_TILE_HEIGHT) return null;

  const candidates = tilesAlongTopEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "x", focused.x, focused.x + focused.w)) return null;

  const expandingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, y: tile.y + 1, h: tile.h - 1 };
    if (expandingTileIds.has(tile.id)) return { ...tile, h: tile.h + 1 };
    return tile;
  });
}

function shrinkFocusedBottomEdge(tiles: Tile[], focused: Tile): TileResizePlan | null {
  if (focused.h <= MIN_TILE_HEIGHT) return null;

  const candidates = tilesAlongBottomEdge(tiles, focused);
  if (!tilesCoverSpan(candidates, "x", focused.x, focused.x + focused.w)) return null;

  const expandingTileIds = new Set(candidates.map((tile) => tile.id));
  return verifiedResizePlan(tiles, (tile) => {
    if (tile.id === focused.id) return { ...tile, h: tile.h - 1 };
    if (expandingTileIds.has(tile.id)) return { ...tile, y: tile.y - 1, h: tile.h + 1 };
    return tile;
  });
}

function tilesAlongLeftEdge(tiles: Tile[], focused: Tile): Tile[] {
  return tiles.filter(
    (tile) =>
      tile.id !== focused.id &&
      tile.x + tile.w === focused.x &&
      tile.y >= focused.y &&
      tile.y + tile.h <= focused.y + focused.h,
  );
}

function tilesAlongRightEdge(tiles: Tile[], focused: Tile): Tile[] {
  return tiles.filter(
    (tile) =>
      tile.id !== focused.id &&
      tile.x === focused.x + focused.w &&
      tile.y >= focused.y &&
      tile.y + tile.h <= focused.y + focused.h,
  );
}

function tilesAlongTopEdge(tiles: Tile[], focused: Tile): Tile[] {
  return tiles.filter(
    (tile) =>
      tile.id !== focused.id &&
      tile.y + tile.h === focused.y &&
      tile.x >= focused.x &&
      tile.x + tile.w <= focused.x + focused.w,
  );
}

function tilesAlongBottomEdge(tiles: Tile[], focused: Tile): Tile[] {
  return tiles.filter(
    (tile) =>
      tile.id !== focused.id &&
      tile.y === focused.y + focused.h &&
      tile.x >= focused.x &&
      tile.x + tile.w <= focused.x + focused.w,
  );
}

function verifiedResizePlan(
  tiles: Tile[],
  updateTile: (tile: Tile) => Tile,
): TileResizePlan | null {
  const nextTiles = tiles.map(updateTile);
  if (!isValidLayout(nextTiles)) return null;
  return { updateTile };
}

export type TileSplitDirection = Extract<Direction, "right" | "down">;

type NewTileOptions =
  | { kind: "terminal"; title: string }
  | { kind: "workspace"; title: string }
  | { kind: "tool"; title: string; integrationId: string; integrationTileId: string };

const defaultNewTileOptions = { kind: "terminal", title: "Terminal" } as const;

export function splitFocusedTile(
  tiles: Tile[],
  focusedTileId: string | null,
  newTileOptions: NewTileOptions = defaultNewTileOptions,
  direction?: TileSplitDirection,
): { tiles: Tile[]; focusedTileId: string | null } {
  const focused = findTile(tiles, focusedTileId);
  if (!focused) return { tiles, focusedTileId };

  if (direction === "right") {
    if (focused.w >= MIN_TILE_WIDTH * 2) return splitTileRight(tiles, focused, newTileOptions);
    return { tiles, focusedTileId };
  }

  if (direction === "down") {
    if (focused.h >= MIN_TILE_HEIGHT * 2) return splitTileDown(tiles, focused, newTileOptions);
    return { tiles, focusedTileId };
  }

  if (focused.w >= MIN_TILE_WIDTH * 2) {
    return splitTileRight(tiles, focused, newTileOptions);
  }

  if (focused.h >= MIN_TILE_HEIGHT * 2) {
    return splitTileDown(tiles, focused, newTileOptions);
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

  const newTileOptions: NewTileOptions = tileOptionsForClone(focused);

  if (direction === "right" && focused.w >= MIN_TILE_WIDTH * 2) {
    return splitTileRight(tiles, focused, newTileOptions);
  }

  if (direction === "down" && focused.h >= MIN_TILE_HEIGHT * 2) {
    return splitTileDown(tiles, focused, newTileOptions);
  }

  return { tiles, focusedTileId };
}

function createTileFromOptions(
  options: NewTileOptions,
  geometry: Pick<Tile, "x" | "y" | "w" | "h">,
): Tile {
  const base = {
    id: createTileId(),
    title: options.title,
    ...geometry,
  };

  if (options.kind === "tool") {
    return {
      ...base,
      kind: "tool",
      integrationId: options.integrationId,
      integrationTileId: options.integrationTileId,
    };
  }

  if (options.kind === "workspace") {
    return { ...base, kind: "workspace" };
  }

  return { ...base, kind: "terminal" };
}

function tileOptionsForClone(tile: Tile): NewTileOptions {
  if (tile.kind === "tool") {
    return {
      kind: "tool",
      title: tile.title,
      integrationId: tile.integrationId,
      integrationTileId: tile.integrationTileId,
    };
  }

  if (tile.kind === "workspace") {
    return { kind: "workspace", title: tile.title };
  }

  return { kind: "terminal", title: tile.title };
}

function splitTileRight(
  tiles: Tile[],
  focused: Tile,
  newTileOptions: NewTileOptions,
): { tiles: Tile[]; focusedTileId: string | null } {
  const leftWidth = Math.floor(focused.w / 2);
  const rightWidth = focused.w - leftWidth;
  const newTile: Tile = createTileFromOptions(newTileOptions, {
    x: focused.x + leftWidth,
    y: focused.y,
    w: rightWidth,
    h: focused.h,
  });
  const updatedFocused = { ...focused, w: leftWidth };
  return {
    tiles: tiles.map((tile) => (tile.id === focused.id ? updatedFocused : tile)).concat(newTile),
    focusedTileId: newTile.id,
  };
}

function splitTileDown(
  tiles: Tile[],
  focused: Tile,
  newTileOptions: NewTileOptions,
): { tiles: Tile[]; focusedTileId: string | null } {
  const topHeight = Math.floor(focused.h / 2);
  const bottomHeight = focused.h - topHeight;
  const newTile: Tile = createTileFromOptions(newTileOptions, {
    x: focused.x,
    y: focused.y + topHeight,
    w: focused.w,
    h: bottomHeight,
  });
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
