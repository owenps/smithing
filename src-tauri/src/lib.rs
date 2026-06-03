mod terminal_session_runtime;

use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    env, fs,
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{IconMenuItem, Menu, NativeIcon, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Listener, Manager, Runtime, State,
};
use terminal_session_runtime::{
    TerminalSessionCloseRequest, TerminalSessionCreateRequest, TerminalSessionResizeRequest,
    TerminalSessionWriteRequest, TerminalState,
};
use uuid::Uuid;

const APP_NAME: &str = "Fluidity";
const OPEN_SETTINGS_MENU_ID: &str = "settings.open";
const OPEN_SETTINGS_EVENT: &str = "app://open-settings";
const ADD_PROJECT_MENU_ID: &str = "project.add";
const ADD_PROJECT_EVENT: &str = "app://add-project";
const NEW_WORKSPACE_MENU_ID: &str = "workspace.new";
const NEW_WORKSPACE_EVENT: &str = "app://new-workspace";
const DISCARD_WORKSPACE_MENU_ID: &str = "workspace.discard";
const DISCARD_WORKSPACE_EVENT: &str = "app://discard-workspace";
const COMMANDS_MANIFEST_JSON: &str = include_str!("../../src/commandsManifest.json");
const INTEGRATION_CATALOG_JSON: &str = include_str!("../../src/shared/integrationCatalog.json");
const APP_STATE_FILE: &str = "app-state.json";
const APP_STATE_VERSION: u32 = 1;
const GRID_COLUMNS: i32 = 12;
const GRID_ROWS: i32 = 8;
const MIN_TILE_WIDTH: i32 = 3;
const MIN_TILE_HEIGHT: i32 = 2;

struct WorkspaceState {
    state_path: PathBuf,
    app_data_dir: PathBuf,
    app_state: Mutex<PersistedAppState>,
}

impl WorkspaceState {
    fn load<R: Runtime>(app: &AppHandle<R>) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| error.to_string())?;
        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        let state_path = app_data_dir.join(APP_STATE_FILE);
        let app_state = load_app_state(&state_path);

        Ok(Self {
            state_path,
            app_data_dir,
            app_state: Mutex::new(app_state),
        })
    }

    fn save(&self, app_state: &PersistedAppState) -> Result<(), String> {
        save_app_state(&self.state_path, app_state)
    }

    fn current_workspace(&self) -> Result<OpenWorkspace, String> {
        let app_state = self.app_state.lock().map_err(lock_error)?;
        current_open_workspace(&app_state)
            .cloned()
            .ok_or_else(|| "no workspace is open".to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedAppState {
    version: u32,
    projects: Vec<RegisteredProject>,
    open_workspaces: Vec<OpenWorkspace>,
    #[serde(default)]
    workspace_stack: Vec<String>,
    #[serde(default, rename = "currentWorkspaceId", skip_serializing)]
    legacy_current_workspace_id: Option<String>,
    #[serde(default)]
    generated_workspace_branch_names: Vec<String>,
}

impl Default for PersistedAppState {
    fn default() -> Self {
        Self {
            version: APP_STATE_VERSION,
            projects: Vec::new(),
            open_workspaces: Vec::new(),
            workspace_stack: Vec::new(),
            legacy_current_workspace_id: None,
            generated_workspace_branch_names: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenWorkspace {
    id: String,
    project_id: String,
    name: String,
    root: String,
    git_branch: Option<String>,
    tile_state: WorkspaceTileState,
    #[serde(default, skip_serializing)]
    last_used_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTileState {
    tiles: Vec<PersistedTile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedTile {
    id: String,
    kind: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    integration_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    integration_tile_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    resume: Option<TileResumeMetadata>,
    #[serde(default, skip_serializing)]
    tool_id: Option<String>,
    #[serde(default, skip_serializing)]
    initial_command: Option<String>,
    x: i32,
    y: i32,
    w: i32,
    h: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TileResumeMetadata {
    provider: String,
    identifier: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceTileStateSaveRequest {
    workspace_id: String,
    tile_state: WorkspaceTileState,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateRequest {
    workspace_id: String,
    tile_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
    launch: TerminalLaunchRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalLaunchRequest {
    kind: String,
    integration_id: Option<String>,
    integration_tile_id: Option<String>,
    resume: Option<TileResumeMetadata>,
    #[serde(default)]
    tool_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResponse {
    session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    assigned_resume: Option<TileResumeMetadata>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalWriteRequest {
    session_id: String,
    data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalResizeRequest {
    session_id: String,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCloseRequest {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandManifestEntry {
    id: String,
    native_accelerator: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct IntegrationCatalog {
    integrations: Vec<IntegrationCatalogIntegration>,
}

#[derive(Debug, Clone, Deserialize)]
struct IntegrationCatalogIntegration {
    id: String,
    tiles: Vec<IntegrationCatalogTile>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IntegrationCatalogTile {
    id: String,
    title: String,
    kind: String,
    tool_command: Option<String>,
    resume_provider: Option<String>,
}

#[derive(Debug, Clone)]
struct ToolIntegrationTile {
    integration_id: String,
    integration_tile_id: String,
    title: String,
    tool_command: String,
    resume_provider: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum ToolAvailabilityStatus {
    Available,
    Unavailable,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolAvailabilityResponse {
    integration_id: String,
    integration_tile_id: String,
    title: String,
    command: String,
    status: ToolAvailabilityStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    resolved_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CurrentWorkspaceResponse {
    workspace_id: String,
    context: WorkspaceContext,
    tile_state: WorkspaceTileState,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceOverview {
    current: Option<CurrentWorkspaceResponse>,
    current_workspace_id: Option<String>,
    open_workspaces: Vec<OpenWorkspaceSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenWorkspaceSummary {
    id: String,
    name: String,
    root: String,
    project_id: String,
    project_name: String,
    project_kind: ProjectKind,
    git_branch: Option<String>,
    discardable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirtyWorkspaceSummary {
    changed_file_count: usize,
    sample_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DirtyConfirmation {
    dirty_workspace_count: usize,
    changed_file_count: usize,
    sample_paths: Vec<String>,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceContext {
    project: ProjectContext,
    workspace: WorkspaceContextInfo,
    git_branch: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct ProjectContext {
    name: String,
    root: String,
    kind: ProjectKind,
}

#[derive(Debug, Clone, Serialize)]
struct WorkspaceContextInfo {
    id: String,
    name: String,
    root: String,
    discardable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectAddResponse {
    current: Option<CurrentWorkspaceResponse>,
    overview: WorkspaceOverview,
    project: Option<RegisteredProject>,
    duplicate: bool,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCreateRequest {
    project_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceCreateResponse {
    current: CurrentWorkspaceResponse,
    overview: WorkspaceOverview,
    warnings: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRemoveRequest {
    project_id: String,
    #[serde(default)]
    confirm_dirty: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiscardRequest {
    workspace_id: String,
    #[serde(default)]
    confirm_dirty: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSwitchRequest {
    workspace_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationResetRequest {
    #[serde(default)]
    confirm_dirty: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectRemoveResponse {
    current: Option<CurrentWorkspaceResponse>,
    overview: WorkspaceOverview,
    project: RegisteredProject,
    removed_workspace_count: usize,
    dirty_confirmation: Option<DirtyConfirmation>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDiscardResponse {
    overview: WorkspaceOverview,
    dirty_confirmation: Option<DirtyConfirmation>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSwitchResponse {
    overview: WorkspaceOverview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplicationResetResponse {
    overview: WorkspaceOverview,
    dirty_confirmation: Option<DirtyConfirmation>,
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegisteredProject {
    id: String,
    name: String,
    root: String,
    kind: ProjectKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisteredProjectListItem {
    id: String,
    name: String,
    root: String,
    kind: ProjectKind,
    root_available: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ProjectKind {
    Git,
    Plain,
}

#[tauri::command]
fn workspace_current(
    state: State<'_, WorkspaceState>,
) -> Result<Option<CurrentWorkspaceResponse>, String> {
    let app_state = state.app_state.lock().map_err(lock_error)?;
    Ok(workspace_overview_for_state(&app_state).current)
}

#[tauri::command]
fn workspace_overview(state: State<'_, WorkspaceState>) -> Result<WorkspaceOverview, String> {
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;
    Ok(workspace_overview_for_state(&app_state))
}

#[tauri::command]
fn project_list(
    state: State<'_, WorkspaceState>,
) -> Result<Vec<RegisteredProjectListItem>, String> {
    let app_state = state.app_state.lock().map_err(lock_error)?;
    Ok(app_state.projects.iter().map(project_list_item).collect())
}

#[tauri::command]
fn project_add(state: State<'_, WorkspaceState>) -> Result<ProjectAddResponse, String> {
    let Some(selected_root) = rfd::FileDialog::new()
        .set_title("Add Project")
        .pick_folder()
    else {
        return Ok(ProjectAddResponse {
            current: None,
            overview: WorkspaceOverview {
                current: None,
                current_workspace_id: None,
                open_workspaces: Vec::new(),
            },
            project: None,
            duplicate: false,
            warnings: Vec::new(),
        });
    };

    let canonical_root = selected_root
        .canonicalize()
        .map_err(|error| format!("Could not read selected project root: {error}"))?;
    if !canonical_root.is_dir() {
        return Err("Selected project root is not a directory".to_string());
    }

    let canonical_root = path_to_string(&canonical_root);
    let app_data_dir = state.app_data_dir.clone();
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let project_index = app_state
        .projects
        .iter()
        .position(|project| project.root == canonical_root);
    let (project, duplicate) = if let Some(index) = project_index {
        let mut project = app_state.projects[index].clone();
        project.name = project_name_for_root(Path::new(&canonical_root));
        project.kind = project_kind_for_root(&canonical_root);
        app_state.projects[index] = project.clone();
        (project, true)
    } else {
        let project = registered_project_for_root(Path::new(&canonical_root));
        app_state.projects.push(project.clone());
        (project, false)
    };

    let mut warnings = Vec::new();
    let workspace_id =
        select_or_create_initial_workspace(&app_data_dir, &mut app_state, &project, &mut warnings)?;
    set_current_workspace(&mut app_state, &workspace_id);
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;
    let overview = workspace_overview_for_state(&app_state);

    Ok(ProjectAddResponse {
        current: overview.current.clone(),
        overview,
        project: Some(project),
        duplicate,
        warnings,
    })
}

#[tauri::command]
fn workspace_create(
    state: State<'_, WorkspaceState>,
    request: WorkspaceCreateRequest,
) -> Result<WorkspaceCreateResponse, String> {
    let app_data_dir = state.app_data_dir.clone();
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let project = app_state
        .projects
        .iter()
        .find(|project| project.id == request.project_id)
        .cloned()
        .ok_or_else(|| "project not found".to_string())?;

    if project.kind != ProjectKind::Git {
        return Err("new workspaces are only available for git-backed projects".to_string());
    }
    if !Path::new(&project.root).is_dir() {
        return Err("project root is missing".to_string());
    }

    let mut warnings = Vec::new();
    let workspace = create_git_workspace(&app_data_dir, &mut app_state, &project, &mut warnings)?;
    let workspace_id = workspace.id.clone();
    app_state.open_workspaces.push(workspace);
    set_current_workspace(&mut app_state, &workspace_id);
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;

    let overview = workspace_overview_for_state(&app_state);
    let current = overview
        .current
        .clone()
        .ok_or_else(|| "created workspace is unavailable".to_string())?;
    Ok(WorkspaceCreateResponse {
        current,
        overview,
        warnings,
    })
}

#[tauri::command]
fn project_remove(
    state: State<'_, WorkspaceState>,
    terminal_state: State<'_, TerminalState>,
    request: ProjectRemoveRequest,
) -> Result<ProjectRemoveResponse, String> {
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let Some(project_index) = app_state
        .projects
        .iter()
        .position(|project| project.id == request.project_id)
    else {
        return Err("project not found".to_string());
    };

    let project = app_state.projects[project_index].clone();
    let workspace_ids = app_state
        .open_workspaces
        .iter()
        .filter(|workspace| workspace.project_id == project.id)
        .map(|workspace| workspace.id.clone())
        .collect::<Vec<_>>();
    let workspaces = workspaces_by_ids(&app_state, &workspace_ids);
    let cleanup_workspaces =
        cleanup_targets_for_managed_workspaces(&state.app_data_dir, &workspaces);

    if let Some(dirty_confirmation) = dirty_confirmation_for_workspaces(&cleanup_workspaces)? {
        if !request.confirm_dirty {
            return Ok(ProjectRemoveResponse {
                current: workspace_overview_for_state(&app_state).current,
                overview: workspace_overview_for_state(&app_state),
                project,
                removed_workspace_count: 0,
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    close_terminal_workspaces(&terminal_state, &workspaces)?;

    if let Some(dirty_confirmation) = dirty_confirmation_for_workspaces(&cleanup_workspaces)? {
        if !request.confirm_dirty {
            return Ok(ProjectRemoveResponse {
                current: workspace_overview_for_state(&app_state).current,
                overview: workspace_overview_for_state(&app_state),
                project,
                removed_workspace_count: 0,
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    let mut warnings = Vec::new();
    remove_workspace_roots(
        &state.app_data_dir,
        &cleanup_workspaces,
        request.confirm_dirty,
        &mut warnings,
    )?;

    let project = app_state.projects.remove(project_index);
    let removed_workspace_count = remove_workspaces_from_state(&mut app_state, &workspace_ids);
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;
    let overview = workspace_overview_for_state(&app_state);

    Ok(ProjectRemoveResponse {
        current: overview.current.clone(),
        overview,
        project,
        removed_workspace_count,
        dirty_confirmation: None,
        warnings,
    })
}

#[tauri::command]
fn workspace_discard(
    state: State<'_, WorkspaceState>,
    terminal_state: State<'_, TerminalState>,
    request: WorkspaceDiscardRequest,
) -> Result<WorkspaceDiscardResponse, String> {
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let target = workspace_cleanup_target(&app_state, &request.workspace_id)?;
    if !workspace_discardable(&state.app_data_dir, &target.project, &target.workspace) {
        return Err("workspace is not discardable".to_string());
    }

    if let Some(dirty_confirmation) =
        dirty_confirmation_for_workspaces(std::slice::from_ref(&target))?
    {
        if !request.confirm_dirty {
            return Ok(WorkspaceDiscardResponse {
                overview: workspace_overview_for_state(&app_state),
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    close_terminal_workspaces(&terminal_state, std::slice::from_ref(&target))?;

    if let Some(dirty_confirmation) =
        dirty_confirmation_for_workspaces(std::slice::from_ref(&target))?
    {
        if !request.confirm_dirty {
            return Ok(WorkspaceDiscardResponse {
                overview: workspace_overview_for_state(&app_state),
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    let mut warnings = Vec::new();
    remove_workspace_roots(
        &state.app_data_dir,
        std::slice::from_ref(&target),
        request.confirm_dirty,
        &mut warnings,
    )?;
    remove_workspaces_from_state(&mut app_state, &[request.workspace_id]);
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;

    Ok(WorkspaceDiscardResponse {
        overview: workspace_overview_for_state(&app_state),
        dirty_confirmation: None,
        warnings,
    })
}

#[tauri::command]
fn workspace_switch(
    state: State<'_, WorkspaceState>,
    request: WorkspaceSwitchRequest,
) -> Result<WorkspaceSwitchResponse, String> {
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let Some(workspace) = app_state
        .open_workspaces
        .iter()
        .find(|workspace| workspace.id == request.workspace_id)
    else {
        return Err("workspace not found".to_string());
    };
    if !workspace_root_available(workspace) {
        return Err("workspace root is missing".to_string());
    }

    set_current_workspace(&mut app_state, &request.workspace_id);
    normalize_workspace_stack(&mut app_state);
    state.save(&app_state)?;
    Ok(WorkspaceSwitchResponse {
        overview: workspace_overview_for_state(&app_state),
    })
}

#[tauri::command]
fn workspace_tile_state_save(
    state: State<'_, WorkspaceState>,
    request: WorkspaceTileStateSaveRequest,
) -> Result<(), String> {
    let mut app_state = state.app_state.lock().map_err(lock_error)?;
    let Some(workspace) = app_state
        .open_workspaces
        .iter_mut()
        .find(|workspace| workspace.id == request.workspace_id)
    else {
        return Err("workspace not found".to_string());
    };

    workspace.tile_state = sanitize_tile_state(request.tile_state);
    state.save(&app_state)
}

#[tauri::command]
fn application_reset(
    workspace_state: State<'_, WorkspaceState>,
    terminal_state: State<'_, TerminalState>,
    request: ApplicationResetRequest,
) -> Result<ApplicationResetResponse, String> {
    let mut app_state = workspace_state.app_state.lock().map_err(lock_error)?;
    let workspaces = app_state
        .open_workspaces
        .iter()
        .filter_map(|workspace| {
            app_state
                .projects
                .iter()
                .find(|project| project.id == workspace.project_id)
                .map(|project| WorkspaceCleanupTarget {
                    workspace: workspace.clone(),
                    project: project.clone(),
                })
        })
        .collect::<Vec<_>>();
    let cleanup_workspaces =
        cleanup_targets_for_managed_workspaces(&workspace_state.app_data_dir, &workspaces);

    if let Some(dirty_confirmation) = dirty_confirmation_for_workspaces(&cleanup_workspaces)? {
        if !request.confirm_dirty {
            return Ok(ApplicationResetResponse {
                overview: workspace_overview_for_state(&app_state),
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    terminal_state.close_all()?;

    if let Some(dirty_confirmation) = dirty_confirmation_for_workspaces(&cleanup_workspaces)? {
        if !request.confirm_dirty {
            return Ok(ApplicationResetResponse {
                overview: workspace_overview_for_state(&app_state),
                dirty_confirmation: Some(dirty_confirmation),
                warnings: Vec::new(),
            });
        }
    }

    let mut warnings = Vec::new();
    remove_workspace_roots(
        &workspace_state.app_data_dir,
        &cleanup_workspaces,
        request.confirm_dirty,
        &mut warnings,
    )?;

    *app_state = PersistedAppState::default();
    workspace_state.save(&app_state)?;

    Ok(ApplicationResetResponse {
        overview: workspace_overview_for_state(&app_state),
        dirty_confirmation: None,
        warnings,
    })
}

#[tauri::command]
fn terminal_create(
    app: AppHandle,
    terminal_state: State<'_, TerminalState>,
    workspace_state: State<'_, WorkspaceState>,
    request: TerminalCreateRequest,
) -> Result<TerminalCreateResponse, String> {
    let cwd = normalize_cwd(&workspace_state, &request.workspace_id, &request.cwd)?;
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let tool_tile = tool_integration_tile_for_launch(&request.launch)?;
    if let Some(tool_tile) = &tool_tile {
        ensure_tool_available(&shell, tool_tile)?;
    }

    let launch_plan = terminal_launch_plan_for_resolved_tool(&request.launch, tool_tile.as_ref())?;
    let response = terminal_state.create(
        app,
        TerminalSessionCreateRequest {
            workspace_id: request.workspace_id,
            tile_id: request.tile_id,
            cwd,
            shell,
            cols: request.cols,
            rows: request.rows,
            shell_command: launch_plan.shell_command,
        },
    )?;

    Ok(TerminalCreateResponse {
        session_id: response.session_id,
        assigned_resume: launch_plan.assigned_resume,
    })
}

#[tauri::command]
fn integration_tool_availability_list() -> Result<Vec<ToolAvailabilityResponse>, String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    Ok(tool_integration_tiles()
        .into_iter()
        .map(|tile| tool_availability_for_tile(&shell, &tile))
        .collect())
}

#[tauri::command]
fn terminal_write(
    state: State<'_, TerminalState>,
    request: TerminalWriteRequest,
) -> Result<(), String> {
    state.write(TerminalSessionWriteRequest {
        session_id: request.session_id,
        data: request.data,
    })
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, TerminalState>,
    request: TerminalResizeRequest,
) -> Result<(), String> {
    state.resize(TerminalSessionResizeRequest {
        session_id: request.session_id,
        cols: request.cols,
        rows: request.rows,
    })
}

#[tauri::command]
fn terminal_close(
    state: State<'_, TerminalState>,
    request: TerminalCloseRequest,
) -> Result<(), String> {
    state.close(TerminalSessionCloseRequest {
        session_id: request.session_id,
    })
}

pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            workspace_current,
            workspace_overview,
            workspace_discard,
            workspace_switch,
            project_list,
            project_add,
            project_remove,
            workspace_create,
            workspace_tile_state_save,
            application_reset,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_close,
            integration_tool_availability_list,
        ])
        .setup(|app| {
            app.manage(WorkspaceState::load(app.handle())?);

            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                if event.id() == OPEN_SETTINGS_MENU_ID {
                    let _ = app.emit(OPEN_SETTINGS_EVENT, ());
                }
                if event.id() == ADD_PROJECT_MENU_ID {
                    let _ = app.emit(ADD_PROJECT_EVENT, ());
                }
                if event.id() == NEW_WORKSPACE_MENU_ID {
                    let _ = app.emit(NEW_WORKSPACE_EVENT, ());
                }
                if event.id() == DISCARD_WORKSPACE_MENU_ID {
                    let _ = app.emit(DISCARD_WORKSPACE_EVENT, ());
                }
            });

            let app_handle = app.handle().clone();
            app.listen("tauri://close-requested", move |_| {
                if let Some(state) = app_handle.try_state::<TerminalState>() {
                    let _ = state.close_all();
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap_or_else(|error| panic!("error while running {APP_NAME}: {error}"));
}

fn build_app_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings_accelerator = native_accelerator_for_command(OPEN_SETTINGS_MENU_ID);
    let settings = IconMenuItem::with_id_and_native_icon(
        app,
        OPEN_SETTINGS_MENU_ID,
        "Settings…",
        true,
        Some(NativeIcon::PreferencesGeneral),
        settings_accelerator.as_deref(),
    )?;
    let add_project = IconMenuItem::with_id_and_native_icon(
        app,
        ADD_PROJECT_MENU_ID,
        "Add Project…",
        true,
        Some(NativeIcon::Add),
        None::<&str>,
    )?;
    let new_workspace_accelerator = native_accelerator_for_command(NEW_WORKSPACE_MENU_ID);
    let new_workspace = IconMenuItem::with_id_and_native_icon(
        app,
        NEW_WORKSPACE_MENU_ID,
        "New Workspace…",
        true,
        Some(NativeIcon::Add),
        new_workspace_accelerator.as_deref(),
    )?;
    let discard_workspace_accelerator = native_accelerator_for_command(DISCARD_WORKSPACE_MENU_ID);
    let discard_workspace = IconMenuItem::with_id_and_native_icon(
        app,
        DISCARD_WORKSPACE_MENU_ID,
        "Discard Workspace",
        true,
        None,
        discard_workspace_accelerator.as_deref(),
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                APP_NAME,
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_workspace,
                    &discard_workspace,
                    &add_project,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            #[cfg(not(any(
                target_os = "macos",
                target_os = "linux",
                target_os = "dragonfly",
                target_os = "freebsd",
                target_os = "netbsd",
                target_os = "openbsd"
            )))]
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_workspace,
                    &discard_workspace,
                    &add_project,
                    &PredefinedMenuItem::separator(app)?,
                    &settings,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    #[cfg(target_os = "macos")]
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            &Submenu::with_items(app, "Help", true, &[])?,
        ],
    )
}

fn load_app_state(state_path: &Path) -> PersistedAppState {
    let Ok(raw_state) = fs::read_to_string(state_path) else {
        if state_path.exists() {
            backup_corrupt_app_state(state_path);
        }
        return PersistedAppState::default();
    };

    let Ok(mut app_state) = serde_json::from_str::<PersistedAppState>(&raw_state) else {
        backup_corrupt_app_state(state_path);
        return PersistedAppState::default();
    };

    if app_state.version != APP_STATE_VERSION {
        backup_corrupt_app_state(state_path);
        return PersistedAppState::default();
    }

    app_state.version = APP_STATE_VERSION;
    for workspace in &mut app_state.open_workspaces {
        workspace.tile_state = sanitize_tile_state(workspace.tile_state.clone());
    }
    migrate_workspace_stack(&mut app_state);
    normalize_workspace_stack(&mut app_state);

    app_state
}

fn save_app_state(state_path: &Path, app_state: &PersistedAppState) -> Result<(), String> {
    if let Some(parent) = state_path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let contents = serde_json::to_string_pretty(app_state).map_err(|error| error.to_string())?;
    let temp_path = state_path.with_extension("json.tmp");
    fs::write(&temp_path, contents).map_err(|error| error.to_string())?;
    fs::rename(&temp_path, state_path).map_err(|error| error.to_string())
}

fn backup_corrupt_app_state(state_path: &Path) {
    if !state_path.exists() {
        return;
    }

    let timestamp = now_unix_seconds();
    let backup_path = state_path.with_file_name(format!("app-state.corrupt-{timestamp}.json"));
    let _ = fs::rename(state_path, backup_path);
}

fn workspace_overview_for_state(app_state: &PersistedAppState) -> WorkspaceOverview {
    WorkspaceOverview {
        current: current_workspace_response(app_state),
        current_workspace_id: current_open_workspace(app_state)
            .map(|workspace| workspace.id.clone()),
        open_workspaces: workspace_summaries_for_state(app_state),
    }
}

fn current_workspace_response(app_state: &PersistedAppState) -> Option<CurrentWorkspaceResponse> {
    let workspace = current_open_workspace(app_state)?;
    let project = app_state
        .projects
        .iter()
        .find(|project| project.id == workspace.project_id)?;

    Some(CurrentWorkspaceResponse {
        workspace_id: workspace.id.clone(),
        context: workspace_context_for_project_and_workspace(project, workspace),
        tile_state: workspace.tile_state.clone(),
    })
}

fn current_open_workspace(app_state: &PersistedAppState) -> Option<&OpenWorkspace> {
    app_state.workspace_stack.iter().find_map(|workspace_id| {
        app_state
            .open_workspaces
            .iter()
            .find(|workspace| &workspace.id == workspace_id && workspace_root_available(workspace))
    })
}

fn select_or_create_initial_workspace(
    app_data_dir: &Path,
    app_state: &mut PersistedAppState,
    project: &RegisteredProject,
    warnings: &mut Vec<String>,
) -> Result<String, String> {
    if let Some(workspace_id) = app_state.workspace_stack.iter().find_map(|workspace_id| {
        app_state
            .open_workspaces
            .iter()
            .find(|workspace| {
                &workspace.id == workspace_id
                    && workspace_selectable_for_project(project, workspace)
            })
            .map(|workspace| workspace.id.clone())
    }) {
        if let Some(workspace) = app_state
            .open_workspaces
            .iter_mut()
            .find(|workspace| workspace.id == workspace_id)
        {
            workspace.git_branch =
                observed_git_branch(project.kind, &workspace.root).or(workspace.git_branch.clone());
            if project.kind == ProjectKind::Git {
                if let Some(branch) = workspace.git_branch.clone() {
                    workspace.name = branch;
                }
            }
        }
        return Ok(workspace_id);
    }

    let workspace = match project.kind {
        ProjectKind::Git => create_git_workspace(app_data_dir, app_state, project, warnings)?,
        ProjectKind::Plain => home_workspace_for_project(project),
    };
    let workspace_id = workspace.id.clone();
    app_state.open_workspaces.push(workspace);
    Ok(workspace_id)
}

fn workspace_selectable_for_project(
    project: &RegisteredProject,
    workspace: &OpenWorkspace,
) -> bool {
    if workspace.project_id != project.id || !workspace_root_available(workspace) {
        return false;
    }

    project.kind == ProjectKind::Plain || workspace.root != project.root
}

fn home_workspace_for_project(project: &RegisteredProject) -> OpenWorkspace {
    OpenWorkspace {
        id: format!("workspace-{}", Uuid::new_v4()),
        project_id: project.id.clone(),
        name: "Home".to_string(),
        root: project.root.clone(),
        git_branch: None,
        tile_state: default_workspace_tile_state(),
        last_used_at: now_unix_seconds(),
    }
}

fn create_git_workspace(
    app_data_dir: &Path,
    app_state: &mut PersistedAppState,
    project: &RegisteredProject,
    warnings: &mut Vec<String>,
) -> Result<OpenWorkspace, String> {
    if has_uncommitted_changes(&project.root)? {
        warnings.push(
            "Project root has uncommitted changes; the new workspace starts from the workspace base branch without those changes."
                .to_string(),
        );
    }

    if !git_command_succeeds(&project.root, &["fetch"])? {
        warnings.push(
            "Could not fetch before creating the workspace; using the locally-known base branch."
                .to_string(),
        );
    }

    let base_ref = workspace_base_ref(&project.root)?;
    let branch = next_workspace_branch_name(app_state, &project.root)?;
    let workspace_id = format!("workspace-{branch}");
    let workspace_root = app_data_dir
        .join("workspaces")
        .join(format!(
            "{}-{}",
            sanitize_path_segment(&project.name),
            sanitize_path_segment(&project.id)
        ))
        .join(&branch);

    if let Some(parent) = workspace_root.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }

    let workspace_root_string = path_to_string(&workspace_root);
    run_git_command(
        &project.root,
        &[
            "worktree",
            "add",
            "-b",
            &branch,
            &workspace_root_string,
            &base_ref,
        ],
    )?;

    app_state
        .generated_workspace_branch_names
        .push(branch.clone());

    let git_branch = observed_git_branch(ProjectKind::Git, &workspace_root_string)
        .unwrap_or_else(|| branch.clone());

    Ok(OpenWorkspace {
        id: workspace_id,
        project_id: project.id.clone(),
        name: git_branch.clone(),
        root: workspace_root_string,
        git_branch: Some(git_branch),
        tile_state: default_workspace_tile_state(),
        last_used_at: now_unix_seconds(),
    })
}

fn default_workspace_tile_state() -> WorkspaceTileState {
    WorkspaceTileState {
        tiles: vec![PersistedTile {
            id: format!("tile-{}", Uuid::new_v4()),
            kind: "terminal".to_string(),
            title: "Terminal".to_string(),
            integration_id: None,
            integration_tile_id: None,
            resume: None,
            tool_id: None,
            initial_command: None,
            x: 0,
            y: 0,
            w: GRID_COLUMNS,
            h: GRID_ROWS,
        }],
    }
}

fn sanitize_tile_state(tile_state: WorkspaceTileState) -> WorkspaceTileState {
    let mut ids = HashSet::new();
    let mut tiles: Vec<PersistedTile> = Vec::new();

    for mut tile in tile_state.tiles {
        if tile.id.trim().is_empty() || !ids.insert(tile.id.clone()) {
            continue;
        }
        if !is_valid_tile_geometry(&tile) {
            continue;
        }
        if tiles.iter().any(|existing| tiles_overlap(existing, &tile)) {
            continue;
        }

        tile.resume = sanitize_resume_metadata(tile.resume);
        let legacy_tool_id = tile.tool_id.take();
        let legacy_initial_command = tile.initial_command.take();

        if tile.kind == "terminal" {
            if let Some(tool_tile) = legacy_tool_integration_tile(
                legacy_tool_id.as_deref(),
                legacy_initial_command.as_deref(),
            ) {
                tile.kind = "tool".to_string();
                tile.integration_id = Some(tool_tile.integration_id);
                tile.integration_tile_id = Some(tool_tile.integration_tile_id);
            } else {
                tile.integration_id = None;
                tile.integration_tile_id = None;
                tile.resume = None;
            }
        }

        if tile.kind == "terminal" {
            if tile.title.trim().is_empty() {
                tile.title = "Terminal".to_string();
            }
            tiles.push(tile);
            continue;
        }

        if tile.kind == "tool" {
            let Some(tool_tile) = tool_integration_tile_for_tile(&tile).or_else(|| {
                legacy_tool_integration_tile(
                    legacy_tool_id.as_deref(),
                    legacy_initial_command.as_deref(),
                )
            }) else {
                continue;
            };

            tile.integration_id = Some(tool_tile.integration_id);
            tile.integration_tile_id = Some(tool_tile.integration_tile_id);
            if tile.title.trim().is_empty() {
                tile.title = tool_tile.title;
            }
            tiles.push(tile);
        }
    }

    if tiles.is_empty() {
        default_workspace_tile_state()
    } else {
        WorkspaceTileState { tiles }
    }
}

fn sanitize_resume_metadata(resume: Option<TileResumeMetadata>) -> Option<TileResumeMetadata> {
    let resume = resume?;
    if !is_valid_resume_provider(&resume.provider) {
        return None;
    }
    if !is_valid_resume_identifier(&resume.identifier) {
        return None;
    }
    Some(resume)
}

fn is_valid_resume_provider(provider: &str) -> bool {
    !provider.is_empty()
        && provider.len() <= 64
        && provider.bytes().all(|byte| {
            byte.is_ascii_lowercase()
                || byte.is_ascii_digit()
                || byte == b'-'
                || byte == b'_'
                || byte == b'.'
        })
}

fn is_valid_resume_identifier(identifier: &str) -> bool {
    !identifier.is_empty()
        && identifier.len() <= 512
        && !identifier.contains('\0')
        && !identifier.contains('\n')
        && !identifier.contains('\r')
}

fn integration_catalog() -> IntegrationCatalog {
    serde_json::from_str(INTEGRATION_CATALOG_JSON)
        .expect("integration catalog should be valid JSON")
}

fn tool_integration_tiles() -> Vec<ToolIntegrationTile> {
    integration_catalog()
        .integrations
        .into_iter()
        .flat_map(|integration| {
            integration
                .tiles
                .into_iter()
                .map(move |tile| (integration.id.clone(), tile))
        })
        .filter_map(|(integration_id, tile)| {
            if tile.kind == "tool" {
                tool_integration_tile_from_catalog(integration_id, tile)
            } else {
                None
            }
        })
        .collect()
}

fn tool_integration_tile(
    integration_id: &str,
    integration_tile_id: &str,
) -> Option<ToolIntegrationTile> {
    tool_integration_tiles().into_iter().find(|tile| {
        tile.integration_id == integration_id && tile.integration_tile_id == integration_tile_id
    })
}

fn tool_integration_tile_for_tile(tile: &PersistedTile) -> Option<ToolIntegrationTile> {
    tool_integration_tile(
        tile.integration_id.as_deref()?,
        tile.integration_tile_id.as_deref()?,
    )
}

fn legacy_tool_integration_tile(
    legacy_tool_id: Option<&str>,
    legacy_initial_command: Option<&str>,
) -> Option<ToolIntegrationTile> {
    let legacy_id = legacy_tool_id.or(legacy_initial_command)?;
    integration_catalog()
        .integrations
        .into_iter()
        .flat_map(|integration| {
            integration
                .tiles
                .into_iter()
                .map(move |tile| (integration.id.clone(), tile))
        })
        .filter_map(|(integration_id, tile)| {
            tool_integration_tile_from_catalog(integration_id, tile)
        })
        .find(|tile| tile.tool_command == legacy_id || tile.resume_provider == legacy_id)
}

fn tool_integration_tile_from_catalog(
    integration_id: String,
    tile: IntegrationCatalogTile,
) -> Option<ToolIntegrationTile> {
    let tool_command = tile.tool_command?;
    Some(ToolIntegrationTile {
        integration_id,
        integration_tile_id: tile.id,
        title: tile.title,
        resume_provider: tile.resume_provider.unwrap_or_else(|| tool_command.clone()),
        tool_command,
    })
}

fn tool_availability_for_tile(shell: &str, tile: &ToolIntegrationTile) -> ToolAvailabilityResponse {
    let check_command = format!("command -v {}", shell_escape_arg(&tile.tool_command));
    match Command::new(shell).arg("-lc").arg(check_command).output() {
        Ok(output) => {
            let resolved_path = String::from_utf8_lossy(&output.stdout)
                .lines()
                .next()
                .map(str::trim)
                .filter(|path| !path.is_empty())
                .map(str::to_string);

            if output.status.success() && resolved_path.is_some() {
                ToolAvailabilityResponse {
                    integration_id: tile.integration_id.clone(),
                    integration_tile_id: tile.integration_tile_id.clone(),
                    title: tile.title.clone(),
                    command: tile.tool_command.clone(),
                    status: ToolAvailabilityStatus::Available,
                    resolved_path,
                    detail: None,
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                ToolAvailabilityResponse {
                    integration_id: tile.integration_id.clone(),
                    integration_tile_id: tile.integration_tile_id.clone(),
                    title: tile.title.clone(),
                    command: tile.tool_command.clone(),
                    status: ToolAvailabilityStatus::Unavailable,
                    resolved_path: None,
                    detail: if stderr.is_empty() {
                        None
                    } else {
                        Some(stderr)
                    },
                }
            }
        }
        Err(error) => ToolAvailabilityResponse {
            integration_id: tile.integration_id.clone(),
            integration_tile_id: tile.integration_tile_id.clone(),
            title: tile.title.clone(),
            command: tile.tool_command.clone(),
            status: ToolAvailabilityStatus::Unknown,
            resolved_path: None,
            detail: Some(error.to_string()),
        },
    }
}

fn ensure_tool_available(shell: &str, tile: &ToolIntegrationTile) -> Result<(), String> {
    let availability = tool_availability_for_tile(shell, tile);
    match availability.status {
        ToolAvailabilityStatus::Available => Ok(()),
        ToolAvailabilityStatus::Unavailable => Err(format!(
            "{} CLI is not installed or is not on Fluidity's PATH. Install `{}` and try again.",
            tile.title, tile.tool_command
        )),
        ToolAvailabilityStatus::Unknown => Err(format!(
            "Fluidity could not verify whether the {} CLI is installed. {}",
            tile.title,
            availability.detail.unwrap_or_else(|| {
                "Check your shell and PATH settings, then try again.".to_string()
            })
        )),
    }
}

fn is_valid_tile_geometry(tile: &PersistedTile) -> bool {
    tile.x >= 0
        && tile.y >= 0
        && tile.w >= MIN_TILE_WIDTH
        && tile.h >= MIN_TILE_HEIGHT
        && tile.x + tile.w <= GRID_COLUMNS
        && tile.y + tile.h <= GRID_ROWS
}

fn tiles_overlap(a: &PersistedTile, b: &PersistedTile) -> bool {
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

#[derive(Debug, Clone)]
struct WorkspaceCleanupTarget {
    workspace: OpenWorkspace,
    project: RegisteredProject,
}

fn migrate_workspace_stack(app_state: &mut PersistedAppState) {
    if !app_state.workspace_stack.is_empty() {
        return;
    }

    if let Some(workspace_id) = app_state.legacy_current_workspace_id.clone() {
        app_state.workspace_stack.push(workspace_id);
    }

    let mut remaining = app_state.open_workspaces.clone();
    remaining.sort_by_key(|workspace| std::cmp::Reverse(workspace.last_used_at));
    for workspace in remaining {
        if !app_state.workspace_stack.contains(&workspace.id) {
            app_state.workspace_stack.push(workspace.id);
        }
    }
}

fn normalize_workspace_stack(app_state: &mut PersistedAppState) {
    let open_ids = app_state
        .open_workspaces
        .iter()
        .map(|workspace| workspace.id.clone())
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    app_state.workspace_stack.retain(|workspace_id| {
        open_ids.contains(workspace_id) && seen.insert(workspace_id.clone())
    });

    for workspace in &app_state.open_workspaces {
        if !seen.contains(&workspace.id) {
            app_state.workspace_stack.push(workspace.id.clone());
            seen.insert(workspace.id.clone());
        }
    }
}

fn set_current_workspace(app_state: &mut PersistedAppState, workspace_id: &str) {
    app_state.workspace_stack.retain(|id| id != workspace_id);
    app_state
        .workspace_stack
        .insert(0, workspace_id.to_string());
}

fn remove_workspaces_from_state(
    app_state: &mut PersistedAppState,
    workspace_ids: &[String],
) -> usize {
    let ids = workspace_ids.iter().cloned().collect::<HashSet<_>>();
    let original_workspace_count = app_state.open_workspaces.len();
    app_state
        .open_workspaces
        .retain(|workspace| !ids.contains(&workspace.id));
    app_state
        .workspace_stack
        .retain(|workspace_id| !ids.contains(workspace_id));
    original_workspace_count - app_state.open_workspaces.len()
}

fn workspace_cleanup_target(
    app_state: &PersistedAppState,
    workspace_id: &str,
) -> Result<WorkspaceCleanupTarget, String> {
    let workspace = app_state
        .open_workspaces
        .iter()
        .find(|workspace| workspace.id == workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    let project = app_state
        .projects
        .iter()
        .find(|project| project.id == workspace.project_id)
        .cloned()
        .ok_or_else(|| "workspace project not found".to_string())?;
    Ok(WorkspaceCleanupTarget { workspace, project })
}

fn workspaces_by_ids(
    app_state: &PersistedAppState,
    workspace_ids: &[String],
) -> Vec<WorkspaceCleanupTarget> {
    workspace_ids
        .iter()
        .filter_map(|workspace_id| workspace_cleanup_target(app_state, workspace_id).ok())
        .collect()
}

fn cleanup_targets_for_managed_workspaces(
    app_data_dir: &Path,
    targets: &[WorkspaceCleanupTarget],
) -> Vec<WorkspaceCleanupTarget> {
    targets
        .iter()
        .filter(|target| workspace_discardable(app_data_dir, &target.project, &target.workspace))
        .cloned()
        .collect()
}

fn close_terminal_workspaces(
    terminal_state: &TerminalState,
    targets: &[WorkspaceCleanupTarget],
) -> Result<(), String> {
    let workspaces = targets
        .iter()
        .map(|target| {
            (
                target.workspace.id.clone(),
                PathBuf::from(&target.workspace.root),
            )
        })
        .collect::<Vec<_>>();
    terminal_state.close_workspaces(&workspaces)
}

fn dirty_confirmation_for_workspaces(
    targets: &[WorkspaceCleanupTarget],
) -> Result<Option<DirtyConfirmation>, String> {
    let summaries = targets
        .iter()
        .filter_map(
            |target| match dirty_workspace_summary(&target.workspace.root) {
                Ok(Some(summary)) => Some(Ok(summary)),
                Ok(None) => None,
                Err(error) => Some(Err(error)),
            },
        )
        .collect::<Result<Vec<_>, _>>()?;

    if summaries.is_empty() {
        return Ok(None);
    }

    let changed_file_count = summaries
        .iter()
        .map(|summary| summary.changed_file_count)
        .sum();
    let sample_paths = summaries
        .iter()
        .flat_map(|summary| summary.sample_paths.clone())
        .take(10)
        .collect::<Vec<_>>();

    Ok(Some(DirtyConfirmation {
        dirty_workspace_count: summaries.len(),
        changed_file_count,
        sample_paths,
        message: "Uncommitted Workspace changes will be deleted.".to_string(),
    }))
}

fn dirty_workspace_summary(root: &str) -> Result<Option<DirtyWorkspaceSummary>, String> {
    if !Path::new(root).is_dir() {
        return Ok(None);
    }

    let status = run_git_command(root, &["status", "--porcelain", "--untracked-files=all"])?;
    let paths = status
        .lines()
        .filter_map(git_status_path)
        .collect::<Vec<_>>();

    if paths.is_empty() {
        return Ok(None);
    }

    Ok(Some(DirtyWorkspaceSummary {
        changed_file_count: paths.len(),
        sample_paths: paths.into_iter().take(10).collect(),
    }))
}

fn git_status_path(line: &str) -> Option<String> {
    let path = line.get(3..)?.trim();
    if path.is_empty() {
        None
    } else if let Some((_, right)) = path.split_once(" -> ") {
        Some(right.to_string())
    } else {
        Some(path.to_string())
    }
}

fn remove_workspace_roots(
    app_data_dir: &Path,
    targets: &[WorkspaceCleanupTarget],
    force: bool,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    for target in targets {
        remove_workspace_root(app_data_dir, target, force, warnings)?;
    }
    Ok(())
}

fn remove_workspace_root(
    app_data_dir: &Path,
    target: &WorkspaceCleanupTarget,
    force: bool,
    warnings: &mut Vec<String>,
) -> Result<(), String> {
    let root = Path::new(&target.workspace.root);
    if !root.is_dir() {
        let _ = git_command_succeeds(&target.project.root, &["worktree", "prune"]);
        warnings.push(format!(
            "Workspace {} was already missing from disk.",
            target.workspace.name
        ));
        return Ok(());
    }

    if !workspace_discardable(app_data_dir, &target.project, &target.workspace) {
        return Err("workspace root is not managed by Fluidity".to_string());
    }

    if Path::new(&target.project.root).is_dir() {
        let mut args = vec!["worktree", "remove"];
        if force {
            args.push("--force");
        }
        args.push(&target.workspace.root);
        run_git_command(&target.project.root, &args).map(|_| ())
    } else {
        fs::remove_dir_all(root).map_err(|error| error.to_string())
    }
}

fn workspace_discardable(
    app_data_dir: &Path,
    project: &RegisteredProject,
    workspace: &OpenWorkspace,
) -> bool {
    project.kind == ProjectKind::Git
        && managed_workspace_root(app_data_dir, Path::new(&workspace.root))
}

fn managed_workspace_root(app_data_dir: &Path, root: &Path) -> bool {
    let managed_root = app_data_dir.join("workspaces");
    if root.is_dir() {
        let Ok(root) = root.canonicalize() else {
            return false;
        };
        let Ok(managed_root) = managed_root.canonicalize() else {
            return false;
        };
        root.starts_with(managed_root)
    } else {
        root.starts_with(managed_root)
    }
}

fn workspace_root_available(workspace: &OpenWorkspace) -> bool {
    Path::new(&workspace.root).is_dir()
}

fn registered_project_for_root(root: &Path) -> RegisteredProject {
    let root = path_to_string(root);
    RegisteredProject {
        id: format!("project-{}", Uuid::new_v4()),
        name: project_name_for_root(Path::new(&root)),
        kind: project_kind_for_root(&root),
        root,
    }
}

fn project_list_item(project: &RegisteredProject) -> RegisteredProjectListItem {
    RegisteredProjectListItem {
        id: project.id.clone(),
        name: project.name.clone(),
        root: project.root.clone(),
        kind: project.kind,
        root_available: Path::new(&project.root).is_dir(),
    }
}

fn workspace_context_for_project_and_workspace(
    project: &RegisteredProject,
    workspace: &OpenWorkspace,
) -> WorkspaceContext {
    let git_branch =
        observed_git_branch(project.kind, &workspace.root).or(workspace.git_branch.clone());
    let workspace_name = if project.kind == ProjectKind::Git {
        git_branch.clone().unwrap_or_else(|| workspace.name.clone())
    } else {
        workspace.name.clone()
    };

    WorkspaceContext {
        project: ProjectContext {
            name: project.name.clone(),
            root: project.root.clone(),
            kind: project.kind,
        },
        workspace: WorkspaceContextInfo {
            id: workspace.id.clone(),
            name: workspace_name,
            root: workspace.root.clone(),
            discardable: project.kind == ProjectKind::Git,
        },
        git_branch,
    }
}

fn workspace_summaries_for_state(app_state: &PersistedAppState) -> Vec<OpenWorkspaceSummary> {
    app_state
        .workspace_stack
        .iter()
        .filter_map(|workspace_id| {
            let workspace = app_state
                .open_workspaces
                .iter()
                .find(|workspace| &workspace.id == workspace_id)?;
            let project = app_state
                .projects
                .iter()
                .find(|project| project.id == workspace.project_id)?;
            let git_branch = observed_git_branch(project.kind, &workspace.root)
                .or_else(|| workspace.git_branch.clone());
            let name = if project.kind == ProjectKind::Git {
                git_branch.clone().unwrap_or_else(|| workspace.name.clone())
            } else {
                workspace.name.clone()
            };

            Some(OpenWorkspaceSummary {
                id: workspace.id.clone(),
                name,
                root: workspace.root.clone(),
                project_id: project.id.clone(),
                project_name: project.name.clone(),
                project_kind: project.kind,
                git_branch,
                discardable: workspace_discardable_for_summary(project),
            })
        })
        .collect()
}

fn workspace_discardable_for_summary(project: &RegisteredProject) -> bool {
    project.kind == ProjectKind::Git
}

fn project_name_for_root(root: &Path) -> String {
    root.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Project")
        .to_string()
}

fn project_kind_for_root(root: &str) -> ProjectKind {
    if git_output(root, &["rev-parse", "--is-inside-work-tree"]).as_deref() == Some("true") {
        ProjectKind::Git
    } else {
        ProjectKind::Plain
    }
}

fn observed_git_branch(project_kind: ProjectKind, root: &str) -> Option<String> {
    if project_kind == ProjectKind::Git {
        git_branch_for_root(root)
    } else {
        None
    }
}

fn git_branch_for_root(root: &str) -> Option<String> {
    git_output(root, &["branch", "--show-current"])
        .or_else(|| git_output(root, &["rev-parse", "--short", "HEAD"]))
}

const WORKSPACE_BRANCH_TREE_NAMES: &[&str] = &[
    "willow", "cedar", "maple", "birch", "aspen", "spruce", "cypress", "elm", "fir", "hemlock",
    "juniper", "laurel", "oak", "pine", "redwood", "sycamore",
];

fn workspace_base_ref(root: &str) -> Result<String, String> {
    if let Some(origin_head) = git_output(
        root,
        &[
            "symbolic-ref",
            "--quiet",
            "--short",
            "refs/remotes/origin/HEAD",
        ],
    ) {
        return Ok(origin_head);
    }

    if let Some(upstream) = git_output(
        root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    ) {
        return Ok(upstream);
    }

    Err("could not find a workspace base branch; set origin/HEAD or configure an upstream for the current branch".to_string())
}

fn has_uncommitted_changes(root: &str) -> Result<bool, String> {
    let output = run_git_command(root, &["status", "--porcelain"])?;
    Ok(!output.trim().is_empty())
}

fn next_workspace_branch_name(app_state: &PersistedAppState, root: &str) -> Result<String, String> {
    let mut used: HashSet<String> = app_state
        .generated_workspace_branch_names
        .iter()
        .cloned()
        .collect();
    used.extend(local_git_branch_names(root)?);

    let offset = Uuid::new_v4().as_bytes()[0] as usize % WORKSPACE_BRANCH_TREE_NAMES.len();
    for suffix in 1..10_000 {
        for index in 0..WORKSPACE_BRANCH_TREE_NAMES.len() {
            let tree_name =
                WORKSPACE_BRANCH_TREE_NAMES[(offset + index) % WORKSPACE_BRANCH_TREE_NAMES.len()];
            let candidate = if suffix == 1 {
                tree_name.to_string()
            } else {
                format!("{tree_name}-{suffix}")
            };
            if !used.contains(&candidate) {
                return Ok(candidate);
            }
        }
    }

    Err("could not generate a unique workspace branch name".to_string())
}

fn local_git_branch_names(root: &str) -> Result<HashSet<String>, String> {
    let branches = run_git_command(root, &["branch", "--format", "%(refname:short)"])?;
    Ok(branches
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

fn git_command_succeeds(root: &str, args: &[&str]) -> Result<bool, String> {
    Ok(git_command(root, args)?.status.success())
}

fn run_git_command(root: &str, args: &[&str]) -> Result<String, String> {
    let output = git_command(root, args)?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if output.status.success() {
        return Ok(stdout);
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(if stderr.is_empty() {
        format!("git {} failed", args.join(" "))
    } else {
        stderr
    })
}

fn git_command(root: &str, args: &[&str]) -> Result<std::process::Output, String> {
    Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|error| error.to_string())
}

fn git_output(root: &str, args: &[&str]) -> Option<String> {
    let output = run_git_command(root, args).ok()?;
    if output.is_empty() {
        None
    } else {
        Some(output)
    }
}

fn sanitize_path_segment(value: &str) -> String {
    let segment = value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || matches!(character, '-' | '_') {
                character
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();

    if segment.is_empty() {
        "project".to_string()
    } else {
        segment
    }
}

struct TerminalLaunchPlan {
    shell_command: Option<String>,
    assigned_resume: Option<TileResumeMetadata>,
}

#[cfg(test)]
fn terminal_launch_plan(launch: &TerminalLaunchRequest) -> Result<TerminalLaunchPlan, String> {
    let tool_tile = tool_integration_tile_for_launch(launch)?;
    terminal_launch_plan_for_resolved_tool(launch, tool_tile.as_ref())
}

fn tool_integration_tile_for_launch(
    launch: &TerminalLaunchRequest,
) -> Result<Option<ToolIntegrationTile>, String> {
    if launch.kind != "tool" {
        return Ok(None);
    }

    launch
        .integration_id
        .as_deref()
        .zip(launch.integration_tile_id.as_deref())
        .and_then(|(integration_id, integration_tile_id)| {
            tool_integration_tile(integration_id, integration_tile_id)
        })
        .or_else(|| legacy_tool_integration_tile(launch.tool_id.as_deref(), None))
        .map(Some)
        .ok_or_else(|| "unsupported integration tile".to_string())
}

fn terminal_launch_plan_for_resolved_tool(
    launch: &TerminalLaunchRequest,
    tool_tile: Option<&ToolIntegrationTile>,
) -> Result<TerminalLaunchPlan, String> {
    let Some(tool_tile) = tool_tile else {
        return Ok(TerminalLaunchPlan {
            shell_command: None,
            assigned_resume: None,
        });
    };

    let existing_resume = launch
        .resume
        .clone()
        .and_then(|resume| sanitize_resume_metadata(Some(resume)));

    if let Some(resume) =
        existing_resume.filter(|resume| resume.provider == tool_tile.resume_provider)
    {
        return Ok(TerminalLaunchPlan {
            shell_command: Some(resume_tool_shell_command(&tool_tile.tool_command, &resume)),
            assigned_resume: None,
        });
    }

    if launch.resume.is_none() {
        if let Some(resume) = new_preassigned_resume(&tool_tile.resume_provider) {
            return Ok(TerminalLaunchPlan {
                shell_command: Some(new_tool_shell_command(&tool_tile.tool_command, &resume)),
                assigned_resume: Some(resume),
            });
        }
    }

    Ok(TerminalLaunchPlan {
        shell_command: Some(shell_command_from_args(vec![tool_tile
            .tool_command
            .clone()])),
        assigned_resume: None,
    })
}

fn new_preassigned_resume(tool_id: &str) -> Option<TileResumeMetadata> {
    if !matches!(tool_id, "claude" | "gemini" | "pi") {
        return None;
    }

    Some(TileResumeMetadata {
        provider: tool_id.to_string(),
        identifier: Uuid::new_v4().to_string(),
    })
}

fn new_tool_shell_command(tool_id: &str, resume: &TileResumeMetadata) -> String {
    let mut args = vec![tool_id.to_string()];

    match tool_id {
        "claude" | "gemini" | "pi" => {
            args.push("--session-id".to_string());
            args.push(resume.identifier.clone());
        }
        _ => {}
    }

    shell_command_from_args(args)
}

fn resume_tool_shell_command(tool_id: &str, resume: &TileResumeMetadata) -> String {
    let mut args = vec![tool_id.to_string()];

    match tool_id {
        "claude" | "gemini" => {
            args.push("--resume".to_string());
            args.push(resume.identifier.clone());
        }
        "codex" => {
            args.push("resume".to_string());
            args.push(resume.identifier.clone());
        }
        "opencode" | "pi" => {
            args.push("--session".to_string());
            args.push(resume.identifier.clone());
        }
        _ => {}
    }

    shell_command_from_args(args)
}

fn shell_command_from_args(args: Vec<String>) -> String {
    args.iter()
        .map(|arg| shell_escape_arg(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_escape_arg(arg: &str) -> String {
    format!("'{}'", arg.replace('\'', "'\\''"))
}

fn normalize_cwd(
    workspace_state: &WorkspaceState,
    workspace_id: &str,
    cwd: &str,
) -> Result<PathBuf, String> {
    let workspace = workspace_state.current_workspace()?;
    if workspace.id != workspace_id {
        return Err("terminal workspace must be the current workspace".to_string());
    }
    let workspace_root = PathBuf::from(workspace.root)
        .canonicalize()
        .map_err(|error| error.to_string())?;
    let path = Path::new(cwd);
    let candidate = if path.is_absolute() {
        path.to_path_buf()
    } else {
        workspace_root.join(path)
    };
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|error| error.to_string())?;

    if !canonical_candidate.starts_with(&workspace_root) {
        return Err("terminal cwd must be inside the current workspace".to_string());
    }

    Ok(canonical_candidate)
}

fn native_accelerator_for_command(command_id: &str) -> Option<String> {
    serde_json::from_str::<Vec<CommandManifestEntry>>(COMMANDS_MANIFEST_JSON)
        .ok()?
        .into_iter()
        .find(|command| command.id == command_id)?
        .native_accelerator
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_launch_plan_assigns_resume_for_preassignable_tools() {
        for tool_id in ["claude", "gemini", "pi"] {
            let plan = terminal_launch_plan(&tool_launch(tool_id, None)).unwrap();
            let assigned_resume = plan.assigned_resume.as_ref().unwrap();

            assert_eq!(assigned_resume.provider, tool_id);
            assert!(is_valid_resume_identifier(&assigned_resume.identifier));
            assert_eq!(
                plan.shell_command,
                Some(format!(
                    "'{}' '--session-id' '{}'",
                    tool_id, assigned_resume.identifier
                ))
            );
        }
    }

    #[test]
    fn terminal_launch_plan_applies_provider_resume_mechanics() {
        assert_eq!(
            terminal_launch_plan(&tool_launch("claude", Some(resume("claude", "abc-123"))))
                .unwrap()
                .shell_command,
            Some("'claude' '--resume' 'abc-123'".to_string())
        );
        assert_eq!(
            terminal_launch_plan(&tool_launch("codex", Some(resume("codex", "thread name"))))
                .unwrap()
                .shell_command,
            Some("'codex' 'resume' 'thread name'".to_string())
        );
        assert_eq!(
            terminal_launch_plan(&tool_launch("gemini", Some(resume("gemini", "session-1"))))
                .unwrap()
                .shell_command,
            Some("'gemini' '--resume' 'session-1'".to_string())
        );
        assert_eq!(
            terminal_launch_plan(&tool_launch(
                "opencode",
                Some(resume("opencode", "session-1")),
            ))
            .unwrap()
            .shell_command,
            Some("'opencode' '--session' 'session-1'".to_string())
        );
        assert_eq!(
            terminal_launch_plan(&tool_launch("pi", Some(resume("pi", "session-1"))))
                .unwrap()
                .shell_command,
            Some("'pi' '--session' 'session-1'".to_string())
        );
    }

    #[test]
    fn terminal_launch_plan_falls_back_to_fresh_launch_for_mismatched_resume() {
        let plan =
            terminal_launch_plan(&tool_launch("claude", Some(resume("pi", "session-1")))).unwrap();

        assert_eq!(plan.shell_command, Some("'claude'".to_string()));
        assert!(plan.assigned_resume.is_none());
    }

    #[test]
    fn terminal_launch_plan_does_not_preassign_capture_only_tools() {
        for tool_id in ["codex", "opencode"] {
            let plan = terminal_launch_plan(&tool_launch(tool_id, None)).unwrap();

            assert_eq!(plan.shell_command, Some(format!("'{}'", tool_id)));
            assert!(plan.assigned_resume.is_none());
        }
    }

    #[test]
    fn tool_availability_reports_missing_commands_as_unavailable() {
        let tile = ToolIntegrationTile {
            integration_id: "missing".to_string(),
            integration_tile_id: "cli".to_string(),
            title: "Missing".to_string(),
            tool_command: "__fluidity_missing_command__".to_string(),
            resume_provider: "missing".to_string(),
        };

        let availability = tool_availability_for_tile("/bin/sh", &tile);

        assert_eq!(availability.status, ToolAvailabilityStatus::Unavailable);
        assert!(availability.resolved_path.is_none());
        assert!(ensure_tool_available("/bin/sh", &tile).is_err());
    }

    #[test]
    fn workspace_stack_migrates_legacy_current_first_then_last_used() {
        let mut app_state = PersistedAppState {
            version: APP_STATE_VERSION,
            projects: Vec::new(),
            open_workspaces: vec![
                test_workspace("workspace-a", 10),
                test_workspace("workspace-b", 30),
            ],
            workspace_stack: Vec::new(),
            legacy_current_workspace_id: Some("workspace-a".to_string()),
            generated_workspace_branch_names: Vec::new(),
        };

        migrate_workspace_stack(&mut app_state);
        normalize_workspace_stack(&mut app_state);

        assert_eq!(
            app_state.workspace_stack,
            vec!["workspace-a", "workspace-b"]
        );
    }

    #[test]
    fn remove_workspaces_from_state_removes_stack_entries() {
        let mut app_state = PersistedAppState {
            version: APP_STATE_VERSION,
            projects: Vec::new(),
            open_workspaces: vec![
                test_workspace("workspace-a", 0),
                test_workspace("workspace-b", 0),
            ],
            workspace_stack: vec!["workspace-b".to_string(), "workspace-a".to_string()],
            legacy_current_workspace_id: None,
            generated_workspace_branch_names: Vec::new(),
        };

        let removed = remove_workspaces_from_state(&mut app_state, &["workspace-b".to_string()]);

        assert_eq!(removed, 1);
        assert_eq!(app_state.workspace_stack, vec!["workspace-a"]);
        assert_eq!(app_state.open_workspaces.len(), 1);
    }

    #[test]
    fn git_status_path_extracts_renames_and_normal_paths() {
        assert_eq!(
            git_status_path(" M src/main.rs"),
            Some("src/main.rs".to_string())
        );
        assert_eq!(
            git_status_path("R  old/name.rs -> new/name.rs"),
            Some("new/name.rs".to_string())
        );
        assert_eq!(git_status_path(""), None);
    }

    #[test]
    fn sanitize_tile_state_migrates_known_initial_commands_to_tool_tiles() {
        let tile_state = WorkspaceTileState {
            tiles: vec![tile_with_initial_command("claude")],
        };

        let sanitized = sanitize_tile_state(tile_state);

        assert_eq!(sanitized.tiles.len(), 1);
        assert_eq!(sanitized.tiles[0].kind, "tool");
        assert_eq!(sanitized.tiles[0].integration_id.as_deref(), Some("claude"));
        assert_eq!(
            sanitized.tiles[0].integration_tile_id.as_deref(),
            Some("cli")
        );
        assert!(sanitized.tiles[0].tool_id.is_none());
        assert!(sanitized.tiles[0].initial_command.is_none());
    }

    #[test]
    fn sanitize_tile_state_discards_unknown_initial_commands() {
        let tile_state = WorkspaceTileState {
            tiles: vec![tile_with_initial_command("custom")],
        };

        let sanitized = sanitize_tile_state(tile_state);

        assert_eq!(sanitized.tiles.len(), 1);
        assert_eq!(sanitized.tiles[0].kind, "terminal");
        assert!(sanitized.tiles[0].tool_id.is_none());
        assert!(sanitized.tiles[0].initial_command.is_none());
    }

    #[test]
    fn sanitize_tile_state_migrates_legacy_tool_ids_to_integration_tiles() {
        let tile_state = WorkspaceTileState {
            tiles: vec![tile_with_legacy_tool_id("codex")],
        };

        let sanitized = sanitize_tile_state(tile_state);

        assert_eq!(sanitized.tiles.len(), 1);
        assert_eq!(sanitized.tiles[0].kind, "tool");
        assert_eq!(sanitized.tiles[0].integration_id.as_deref(), Some("codex"));
        assert_eq!(
            sanitized.tiles[0].integration_tile_id.as_deref(),
            Some("cli")
        );
        assert_eq!(sanitized.tiles[0].title, "Codex");
        assert!(sanitized.tiles[0].tool_id.is_none());
    }

    fn resume(provider: &str, identifier: &str) -> TileResumeMetadata {
        TileResumeMetadata {
            provider: provider.to_string(),
            identifier: identifier.to_string(),
        }
    }

    fn tool_launch(tool_id: &str, resume: Option<TileResumeMetadata>) -> TerminalLaunchRequest {
        TerminalLaunchRequest {
            kind: "tool".to_string(),
            integration_id: Some(tool_id.to_string()),
            integration_tile_id: Some("cli".to_string()),
            resume,
            tool_id: None,
        }
    }

    fn test_workspace(id: &str, last_used_at: u64) -> OpenWorkspace {
        OpenWorkspace {
            id: id.to_string(),
            project_id: "project-test".to_string(),
            name: id.to_string(),
            root: "/tmp/fluidity-test".to_string(),
            git_branch: None,
            tile_state: default_workspace_tile_state(),
            last_used_at,
        }
    }

    fn tile_with_initial_command(initial_command: &str) -> PersistedTile {
        PersistedTile {
            id: "tile-test".to_string(),
            kind: "terminal".to_string(),
            title: "Test".to_string(),
            integration_id: None,
            integration_tile_id: None,
            resume: None,
            tool_id: None,
            initial_command: Some(initial_command.to_string()),
            x: 0,
            y: 0,
            w: MIN_TILE_WIDTH,
            h: MIN_TILE_HEIGHT,
        }
    }

    fn tile_with_legacy_tool_id(tool_id: &str) -> PersistedTile {
        PersistedTile {
            id: "tile-test".to_string(),
            kind: "tool".to_string(),
            title: "".to_string(),
            integration_id: None,
            integration_tile_id: None,
            resume: None,
            tool_id: Some(tool_id.to_string()),
            initial_command: None,
            x: 0,
            y: 0,
            w: MIN_TILE_WIDTH,
            h: MIN_TILE_HEIGHT,
        }
    }
}

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}
