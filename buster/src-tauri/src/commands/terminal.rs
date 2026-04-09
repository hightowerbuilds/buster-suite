use tauri::{command, AppHandle, Emitter, State};

use crate::terminal::{TermScreenDelta, TerminalManager};

#[command]
pub fn terminal_spawn(
    app: AppHandle,
    state: State<'_, TerminalManager>,
    rows: u16,
    cols: u16,
    cwd: Option<String>,
) -> Result<String, String> {
    let app_handle = app.clone();
    state.spawn(rows, cols, cwd, move |id, delta| {
        let _ = app_handle.emit("terminal-screen", TermScreenEvent {
            term_id: id,
            delta,
        });
    })
}

#[command]
pub fn terminal_write(
    state: State<'_, TerminalManager>,
    term_id: String,
    data: String,
) -> Result<(), String> {
    state.write(&term_id, data.as_bytes())
}

#[command]
pub fn terminal_resize(
    state: State<'_, TerminalManager>,
    term_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    state.resize(&term_id, rows, cols)
}

#[command]
pub fn terminal_kill(
    state: State<'_, TerminalManager>,
    term_id: String,
) -> Result<(), String> {
    state.kill(&term_id)
}

#[derive(Clone, serde::Serialize)]
struct TermScreenEvent {
    term_id: String,
    delta: TermScreenDelta,
}
