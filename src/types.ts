export const GRID_COLUMNS = 12;
export const GRID_ROWS = 8;
export const GRID_MIN_TILE_WIDTH = 1;
export const GRID_MIN_TILE_HEIGHT = 1;
export const DEFAULT_WORKSPACE_TILE_WIDTH = 3;

export type Direction = "left" | "down" | "up" | "right";

export type TileKind = "terminal" | "tool" | "workspace" | "code" | "diff";

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
  extensionId: string;
  integrationId: string;
  integrationTileId: string;
}

export interface WorkspaceStackTile extends BaseTile {
  kind: "workspace";
}

export type CodeEditorAutoSave = "off" | "onFocusChange" | "afterDelay";
export type CodeEditorTabTitleMode = "path" | "basename";

export interface CodeEditorSettings {
  lineNumbersVisible: boolean;
  minimapVisible: boolean;
  wordWrap: boolean;
  fontSize: number;
  tabSize: number;
  vimMode: boolean;
  bracketPairColorization: boolean;
  stickyScroll: boolean;
  autoSave: CodeEditorAutoSave;
  tabTitleMode: CodeEditorTabTitleMode;
  tabsVisible: boolean;
}

export interface TerminalTileSettings {
  fontSize: number;
}

export interface TileSettings {
  terminal: TerminalTileSettings;
  codeEditor: CodeEditorSettings;
}

export interface CodeEditorViewState {
  cursor?: { lineNumber: number; column: number };
  scrollTop?: number;
  scrollLeft?: number;
}

export interface CodeEditorTabState {
  path: string;
  version?: string | null;
  viewState?: CodeEditorViewState | null;
}

export interface CodeEditorTileState {
  tabs: CodeEditorTabState[];
  activePath?: string | null;
}

export interface CodeEditorWorkspaceTile extends BaseTile {
  kind: "code";
  editor?: CodeEditorTileState;
}

export type DiffAnnotationSource = "local" | "github";

export interface DiffAnnotation {
  id: string;
  source: DiffAnnotationSource;
  filePath: string;
  startLine: number;
  endLine: number;
  comment: string;
  selectedDiff: string;
  stale: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiffWorkspaceTile extends BaseTile {
  kind: "diff";
  annotations?: DiffAnnotation[];
}

export interface DiffAnnotationSendTarget {
  id: string;
  label: string;
}

export type Tile =
  | TerminalWorkspaceTile
  | ToolWorkspaceTile
  | WorkspaceStackTile
  | CodeEditorWorkspaceTile
  | DiffWorkspaceTile;

export type ProjectKind = "git" | "plain";

export interface ProjectSettings {
  deleteWorkspaceBranchOnDiscard: boolean;
  workspaceBranchPrefix: string | null;
  workspaceCopyFiles: string[];
  projectSearchIncludePaths: string[];
  projectSearchExcludePaths: string[];
}

export interface RegisteredProject {
  id: string;
  name: string;
  root: string;
  kind: ProjectKind;
  rootAvailable?: boolean;
  settings: ProjectSettings;
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
  discardable: boolean;
}

export interface OpenWorkspaceSummary {
  id: string;
  name: string;
  root: string;
  projectId: string;
  projectName: string;
  projectKind: ProjectKind;
  gitBranch: string | null;
  discardable: boolean;
  linesAdded?: number;
  linesDeleted?: number;
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

export interface WorkspaceOverview {
  current: CurrentWorkspaceResponse | null;
  currentWorkspaceId: string | null;
  openWorkspaces: OpenWorkspaceSummary[];
}

export interface DirtyConfirmation {
  dirtyWorkspaceCount: number;
  changedFileCount: number;
  samplePaths: string[];
  message: string;
}

export interface ProjectAddResponse {
  current: CurrentWorkspaceResponse | null;
  overview: WorkspaceOverview;
  project: RegisteredProject | null;
  duplicate: boolean;
  warnings: string[];
}

export interface WorkspaceCreateRequest {
  projectId: string;
}

export interface WorkspaceCreateResponse {
  current: CurrentWorkspaceResponse;
  overview: WorkspaceOverview;
  warnings: string[];
}

export interface WorkspaceDiscardRequest {
  workspaceId: string;
  confirmDirty: boolean;
}

export interface WorkspaceDiscardResponse {
  overview: WorkspaceOverview;
  dirtyConfirmation: DirtyConfirmation | null;
  warnings: string[];
}

export interface WorkspaceSwitchRequest {
  workspaceId: string;
}

export interface WorkspaceSwitchResponse {
  overview: WorkspaceOverview;
}

export interface ProjectRemoveRequest {
  projectId: string;
  confirmDirty?: boolean;
}

export interface ProjectRemoveResponse {
  current: CurrentWorkspaceResponse | null;
  overview: WorkspaceOverview;
  project: RegisteredProject;
  removedWorkspaceCount: number;
  dirtyConfirmation: DirtyConfirmation | null;
  warnings: string[];
}

export interface ApplicationResetRequest {
  confirmDirty: boolean;
}

export interface ApplicationResetResponse {
  overview: WorkspaceOverview;
  dirtyConfirmation: DirtyConfirmation | null;
  warnings: string[];
}

export interface WorkspaceTileStateSaveRequest {
  workspaceId: string;
  tileState: WorkspaceTileState;
}

export interface CurrentWorkspaceGitPatchResponse {
  workspaceId: string | null;
  available: boolean;
  patch: string;
  message?: string;
}

export interface CodeFileReadRequest {
  workspaceId: string;
  path: string;
}

export interface CodeFileReadResponse {
  path: string;
  contents: string;
  version: string;
}

export interface CodeFileWriteRequest {
  workspaceId: string;
  path: string;
  contents: string;
  expectedVersion?: string | null;
}

export interface CodeFileWriteResponse {
  path: string;
  version: string;
}

export interface CodeFileStatRequest {
  workspaceId: string;
  path: string;
}

export interface CodeFileStatResponse {
  path: string;
  exists: boolean;
  version?: string | null;
}

export interface ProjectFileIndexRequest {
  workspaceId: string;
}

export interface ProjectFileIndexEntry {
  path: string;
  touchedAt: number;
}

export interface ProjectFileIndexResponse {
  files: ProjectFileIndexEntry[];
  indexedAt: number;
}

export type TerminalLaunch =
  | { kind: "shell" }
  | {
      kind: "tool";
      extensionId: string;
      integrationId: string;
      integrationTileId: string;
      resume?: TileResumeMetadata;
    };

export interface TerminalCreateRequest {
  workspaceId: string;
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

export type ToolAvailabilityStatus = "available" | "unavailable" | "unknown";

export interface IntegrationCatalogListRequest {
  workspaceId?: string | null;
}

export interface IntegrationCatalogResponse {
  tiles: IntegrationCatalogTile[];
  diagnostics: ExtensionDiagnostic[];
}

export interface IntegrationCatalogTile {
  extensionId: string;
  integrationId: string;
  integrationTileId: string;
  title: string;
  defaultVisible: boolean;
  icon?: IntegrationCatalogTileIcon;
  provenance: ExtensionContributionProvenance;
}

export type IntegrationCatalogTileIcon =
  | { kind: "key"; key: string; fallbackText: string }
  | { kind: "path"; path: string; fallbackText: string }
  | { kind: "text"; fallbackText: string };

export interface ExtensionContributionProvenance {
  sourceKind: "core" | "global" | "project";
  extensionId: string;
  manifestPath?: string;
  projectId?: string;
  projectRoot?: string;
}

export interface ExtensionDiagnostic extends ExtensionContributionProvenance {
  severity: "warning" | "error";
  message: string;
}

export interface ExtensionSettingsListRequest {
  workspaceId?: string | null;
}

export interface ExtensionSettingsResponse {
  extensions: ExtensionSettingsEntry[];
  diagnostics: ExtensionDiagnostic[];
}

export type ExtensionSettingsStatus = "loaded" | "invalid" | "skipped";

export interface ExtensionSettingsEntry extends ExtensionContributionProvenance {
  title: string;
  status: ExtensionSettingsStatus;
  diagnostics: ExtensionDiagnostic[];
  tiles: ExtensionSettingsTile[];
}

export interface ExtensionSettingsTile {
  integrationId: string;
  integrationTileId: string;
  title: string;
  defaultVisible: boolean;
}

export interface ToolAvailabilityListRequest {
  workspaceId?: string | null;
}

export interface ToolAvailability {
  extensionId: string;
  integrationId: string;
  integrationTileId: string;
  title: string;
  command: string;
  status: ToolAvailabilityStatus;
  resolvedPath?: string;
  detail?: string;
  provenance: ExtensionContributionProvenance;
}
