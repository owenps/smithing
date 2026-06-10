use portable_pty::{native_pty_system, Child, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

#[derive(Clone, Default)]
pub(crate) struct TerminalState {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

struct TerminalSession {
    workspace_id: String,
    tile_id: String,
    cwd: PathBuf,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child_killer: Box<dyn ChildKiller + Send + Sync>,
}

pub(crate) struct TerminalSessionCreateRequest {
    pub(crate) workspace_id: String,
    pub(crate) tile_id: String,
    pub(crate) cwd: PathBuf,
    pub(crate) shell: String,
    pub(crate) environment: HashMap<String, String>,
    pub(crate) cols: u16,
    pub(crate) rows: u16,
    pub(crate) shell_command: Option<String>,
}

pub(crate) struct TerminalSessionCreateResponse {
    pub(crate) session_id: String,
}

pub(crate) struct TerminalSessionWriteRequest {
    pub(crate) session_id: String,
    pub(crate) data: String,
}

pub(crate) struct TerminalSessionResizeRequest {
    pub(crate) session_id: String,
    pub(crate) cols: u16,
    pub(crate) rows: u16,
}

pub(crate) struct TerminalSessionCloseRequest {
    pub(crate) session_id: String,
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

impl TerminalState {
    pub(crate) fn create(
        &self,
        app: AppHandle,
        request: TerminalSessionCreateRequest,
    ) -> Result<TerminalSessionCreateResponse, String> {
        if let Some(session_id) =
            self.session_id_for_tile(&request.workspace_id, &request.tile_id)?
        {
            return Ok(TerminalSessionCreateResponse { session_id });
        }

        let session_id = format!("terminal-{}", Uuid::new_v4());
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: request.rows.max(1),
                cols: request.cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|error| error.to_string())?;

        let cwd = request.cwd;
        let mut command = terminal_command(
            &request.shell,
            cwd.clone(),
            request.shell_command.as_deref(),
        );
        for (key, value) in request.environment {
            command.env(key, value);
        }
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("FLUIDITY_TILE_ID", &request.tile_id);

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

        self.sessions.lock().map_err(lock_error)?.insert(
            session_id.clone(),
            TerminalSession {
                workspace_id: request.workspace_id,
                tile_id: request.tile_id,
                cwd,
                master: pair.master,
                writer,
                child_killer,
            },
        );

        spawn_output_thread(app.clone(), session_id.clone(), reader);
        spawn_wait_thread(app, session_id.clone(), child);

        Ok(TerminalSessionCreateResponse { session_id })
    }

    fn session_id_for_tile(
        &self,
        workspace_id: &str,
        tile_id: &str,
    ) -> Result<Option<String>, String> {
        Ok(self
            .sessions
            .lock()
            .map_err(lock_error)?
            .iter()
            .find(|(_, session)| session.workspace_id == workspace_id && session.tile_id == tile_id)
            .map(|(session_id, _)| session_id.clone()))
    }

    pub(crate) fn write(&self, request: TerminalSessionWriteRequest) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(lock_error)?;
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

    pub(crate) fn resize(&self, request: TerminalSessionResizeRequest) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(lock_error)?;
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

    pub(crate) fn close(&self, request: TerminalSessionCloseRequest) -> Result<(), String> {
        let session = self
            .sessions
            .lock()
            .map_err(lock_error)?
            .remove(&request.session_id);

        if let Some(mut session) = session {
            let _ = session.child_killer.kill();
        }

        Ok(())
    }

    pub(crate) fn close_workspace(
        &self,
        workspace_id: &str,
        workspace_root: &PathBuf,
    ) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(lock_error)?;
        let session_ids = sessions
            .iter()
            .filter(|(_, session)| {
                session.workspace_id == workspace_id || session.cwd.starts_with(workspace_root)
            })
            .map(|(session_id, _)| session_id.clone())
            .collect::<Vec<_>>();

        for session_id in session_ids {
            if let Some(mut session) = sessions.remove(&session_id) {
                let _ = session.child_killer.kill();
            }
        }

        Ok(())
    }

    pub(crate) fn close_workspaces(&self, workspaces: &[(String, PathBuf)]) -> Result<(), String> {
        for (workspace_id, workspace_root) in workspaces {
            self.close_workspace(workspace_id, workspace_root)?;
        }
        Ok(())
    }

    pub(crate) fn close_all(&self) -> Result<(), String> {
        for (_, mut session) in self.sessions.lock().map_err(lock_error)?.drain() {
            let _ = session.child_killer.kill();
        }

        Ok(())
    }
}

fn terminal_command(shell: &str, cwd: PathBuf, shell_command: Option<&str>) -> CommandBuilder {
    let mut command = CommandBuilder::new(shell);
    command.cwd(cwd);

    if let Some(shell_command) = shell_command {
        command.arg("-lc");
        command.arg(shell_command);
    } else {
        command.arg("-l");
    }

    command
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

fn lock_error<T>(error: std::sync::PoisonError<T>) -> String {
    error.to_string()
}
