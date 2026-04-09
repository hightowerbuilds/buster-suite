use tauri::{command, State};
use crate::remote::{RemoteManager, RemoteFileEntry, RemoteFileContent, RemoteConnectionInfo};

#[command]
pub fn remote_connect(
    state: State<'_, RemoteManager>,
    host: String,
    port: Option<u16>,
    user: String,
    remote_root: String,
    password: Option<String>,
) -> Result<(), String> {
    state.connect(&host, port.unwrap_or(22), &user, &remote_root, password.as_deref())
}

#[command]
pub fn remote_disconnect(state: State<'_, RemoteManager>) -> Result<(), String> {
    state.disconnect();
    Ok(())
}

#[command]
pub fn remote_status(state: State<'_, RemoteManager>) -> Result<Option<RemoteConnectionInfo>, String> {
    Ok(state.connection_info())
}

#[command]
pub fn remote_list_directory(
    state: State<'_, RemoteManager>,
    path: String,
) -> Result<Vec<RemoteFileEntry>, String> {
    state.list_directory(&path)
}

#[command]
pub fn remote_read_file(
    state: State<'_, RemoteManager>,
    path: String,
) -> Result<RemoteFileContent, String> {
    state.read_file(&path)
}

#[command]
pub fn remote_write_file(
    state: State<'_, RemoteManager>,
    path: String,
    content: String,
) -> Result<(), String> {
    state.write_file(&path, &content)
}

#[command]
pub fn remote_exec(
    state: State<'_, RemoteManager>,
    command: String,
) -> Result<String, String> {
    state.exec_command(&command)
}
