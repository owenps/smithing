use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
    thread,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Listener, Manager, State,
};
use uuid::Uuid;

const OPEN_SETTINGS_MENU_ID: &str = "settings.open";
const OPEN_SETTINGS_EVENT: &str = "app://open-settings";
const COMMANDS_MANIFEST_JSON: &str = include_str!("../../src/commandsManifest.json");

#[derive(Default)]
struct TerminalState {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

struct TerminalSession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child_killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateRequest {
    tile_id: String,
    cwd: String,
    cols: u16,
    rows: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCreateResponse {
    session_id: String,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    session_id: String,
    data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExitEvent {
    session_id: String,
    exit_code: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CommandManifestEntry {
    id: String,
    native_accelerator: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceContext {
    project: ProjectContext,
    workspace: WorkspaceContextInfo,
    git_branch: Option<String>,
}

#[derive(Debug, Serialize)]
struct ProjectContext {
    name: String,
    root: String,
}

#[derive(Debug, Serialize)]
struct WorkspaceContextInfo {
    name: String,
    root: String,
}

#[tauri::command]
fn workspace_context() -> Result<WorkspaceContext, String> {
    let root = current_workspace_root().map_err(|error| error.to_string())?;
    let name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Smithing")
        .to_string();
    let root = root.to_string_lossy().to_string();
    let git_branch = git_branch_for_root(&root);

    Ok(WorkspaceContext {
        project: ProjectContext {
            name: name.clone(),
            root: root.clone(),
        },
        workspace: WorkspaceContextInfo { name, root },
        git_branch,
    })
}

#[tauri::command]
fn terminal_create(
    app: AppHandle,
    state: State<'_, TerminalState>,
    request: TerminalCreateRequest,
) -> Result<TerminalCreateResponse, String> {
    let session_id = format!("terminal-{}", Uuid::new_v4());
    let cwd = normalize_cwd(&request.cwd)?;
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: request.rows.max(1),
            cols: request.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())?;

    let mut command = CommandBuilder::new(shell);
    command.cwd(cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("SMITHING_TILE_ID", request.tile_id);

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| error.to_string())?;
    let child_killer = child.clone_killer();
    drop(pair.slave);

    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| error.to_string())?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| error.to_string())?;

    state.sessions.lock().map_err(lock_error)?.insert(
        session_id.clone(),
        TerminalSession {
            master: pair.master,
            writer,
            child_killer,
        },
    );

    spawn_output_thread(app.clone(), session_id.clone(), reader);
    spawn_wait_thread(app, session_id.clone(), child);

    Ok(TerminalCreateResponse { session_id })
}

#[tauri::command]
fn terminal_write(
    state: State<'_, TerminalState>,
    request: TerminalWriteRequest,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(lock_error)?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| "terminal session not found".to_string())?;

    session
        .writer
        .write_all(request.data.as_bytes())
        .map_err(|error| error.to_string())?;
    session.writer.flush().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn terminal_resize(
    state: State<'_, TerminalState>,
    request: TerminalResizeRequest,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(lock_error)?;
    let session = sessions
        .get_mut(&request.session_id)
        .ok_or_else(|| "terminal session not found".to_string())?;

    session
        .master
        .resize(PtySize {
            rows: request.rows.max(1),
            cols: request.cols.max(1),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn terminal_close(
    state: State<'_, TerminalState>,
    request: TerminalCloseRequest,
) -> Result<(), String> {
    let session = state
        .sessions
        .lock()
        .map_err(lock_error)?
        .remove(&request.session_id);

    if let Some(mut session) = session {
        let _ = session.child_killer.kill();
    }

    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .invoke_handler(tauri::generate_handler![
            workspace_context,
            terminal_create,
            terminal_write,
            terminal_resize,
            terminal_close,
        ])
        .setup(|app| {
            let menu = build_app_menu(app.handle())?;
            app.set_menu(menu)?;

            app.on_menu_event(|app, event| {
                if event.id() == OPEN_SETTINGS_MENU_ID {
                    let _ = app.emit(OPEN_SETTINGS_EVENT, ());
                }
            });

            let app_handle = app.handle().clone();
            app.listen("tauri://close-requested", move |_| {
                if let Some(state) = app_handle.try_state::<TerminalState>() {
                    if let Ok(mut sessions) = state.sessions.lock() {
                        for (_, mut session) in sessions.drain() {
                            let _ = session.child_killer.kill();
                        }
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Smithing");
}

fn build_app_menu<R: tauri::Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let settings_accelerator = native_accelerator_for_command(OPEN_SETTINGS_MENU_ID);
    let settings = MenuItem::with_id(
        app,
        OPEN_SETTINGS_MENU_ID,
        "Settings…",
        true,
        settings_accelerator.as_deref(),
    )?;

    Menu::with_items(
        app,
        &[
            #[cfg(target_os = "macos")]
            &Submenu::with_items(
                app,
                "Smithing",
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
                &[&PredefinedMenuItem::close_window(app, None)?],
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

fn native_accelerator_for_command(command_id: &str) -> Option<String> {
    serde_json::from_str::<Vec<CommandManifestEntry>>(COMMANDS_MANIFEST_JSON)
        .ok()?
        .into_iter()
        .find(|command| command.id == command_id)?
        .native_accelerator
}

fn spawn_output_thread(app: AppHandle, session_id: String, mut reader: Box<dyn Read + Send>) {
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    let data = String::from_utf8_lossy(&buffer[..count]).to_string();
                    let _ = app.emit(
                        "terminal://output",
                        TerminalOutputEvent {
                            session_id: session_id.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
    });
}

fn spawn_wait_thread(app: AppHandle, session_id: String, mut child: Box<dyn Child + Send + Sync>) {
    thread::spawn(move || {
        let exit_code = child
            .wait()
            .ok()
            .and_then(|status| i32::try_from(status.exit_code()).ok());

        if let Some(state) = app.try_state::<TerminalState>() {
            if let Ok(mut sessions) = state.sessions.lock() {
                sessions.remove(&session_id);
            }
        }

        let _ = app.emit(
            "terminal://exit",
            TerminalExitEvent {
                session_id,
                exit_code,
            },
        );
    });
}

fn current_workspace_root() -> Result<PathBuf, std::io::Error> {
    let cwd = env::current_dir()?;
    if cwd.file_name().and_then(|name| name.to_str()) == Some("src-tauri") {
        if let Some(parent) = cwd.parent() {
            return Ok(parent.to_path_buf());
        }
    }
    Ok(cwd)
}

fn git_branch_for_root(root: &str) -> Option<String> {
    git_output(root, &["branch", "--show-current"])
        .or_else(|| git_output(root, &["rev-parse", "--short", "HEAD"]))
}

fn git_output(root: &str, args: &[&str]) -> Option<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn normalize_cwd(cwd: &str) -> Result<PathBuf, String> {
    let workspace_root = current_workspace_root()
        .and_then(|root| root.canonicalize())
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

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}
