export const GRID_COLUMNS = 12;
export const GRID_ROWS = 8;
export const MIN_TILE_WIDTH = 3;
export const MIN_TILE_HEIGHT = 2;

export type Direction = "left" | "down" | "up" | "right";

export type TileKind = "terminal" | "tool";

export interface TileResumeMetadata {
  provider: string;
  identifier: string;
}

interface BaseTile {
  id: string;
  kind: TileKind;
  title: string;
  resume?: TileResumeMetadata;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TerminalWorkspaceTile extends BaseTile {
  kind: "terminal";
}

export interface ToolWorkspaceTile extends BaseTile {
  kind: "tool";
  integrationId: string;
  integrationTileId: string;
}

export type Tile = TerminalWorkspaceTile | ToolWorkspaceTile;

export type ProjectKind = "git" | "plain";

export interface RegisteredProject {
  id: string;
  name: string;
  root: string;
  kind: ProjectKind;
}

export interface Project {
  name: string;
  root: string;
  kind: ProjectKind;
}

export interface Workspace {
  id: string;
  name: string;
  root: string;
}

export interface WorkspaceContext {
  project: Project;
  workspace: Workspace;
  gitBranch: string | null;
}

export interface WorkspaceTileState {
  tiles: Tile[];
}

export interface CurrentWorkspaceResponse {
  workspaceId: string;
  context: WorkspaceContext;
  tileState: WorkspaceTileState;
}

export interface ProjectAddResponse {
  current: CurrentWorkspaceResponse | null;
  project: RegisteredProject | null;
  duplicate: boolean;
}

export interface ProjectRemoveRequest {
  projectId: string;
}

export interface ProjectRemoveResponse {
  current: CurrentWorkspaceResponse | null;
  project: RegisteredProject;
  removedWorkspaceCount: number;
}

export interface WorkspaceTileStateSaveRequest {
  workspaceId: string;
  tileState: WorkspaceTileState;
}

export type TerminalLaunch =
  | { kind: "shell" }
  | {
      kind: "tool";
      integrationId: string;
      integrationTileId: string;
      resume?: TileResumeMetadata;
    };

export interface TerminalCreateRequest {
  tileId: string;
  cwd: string;
  cols: number;
  rows: number;
  launch: TerminalLaunch;
}

export interface TerminalCreateResponse {
  sessionId: string;
  assignedResume?: TileResumeMetadata;
}

export interface TerminalWriteRequest {
  sessionId: string;
  data: string;
}

export interface TerminalResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalCloseRequest {
  sessionId: string;
}

export interface TerminalOutputEvent {
  sessionId: string;
  data: string;
}

export interface TerminalExitEvent {
  sessionId: string;
  exitCode: number | null;
}
