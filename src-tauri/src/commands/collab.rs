use tauri::{command, State};
use crate::collab::{CollabManager, PeerInfo, CollabOperation, CursorUpdate};
use crate::collab::crdt::Operation;

#[command]
pub fn collab_start_session(
    state: State<'_, CollabManager>,
    doc_path: String,
    initial_text: String,
) -> Result<String, String> {
    state.start_session(&doc_path, &initial_text)?;
    Ok(state.client_id().to_string())
}

#[command]
pub fn collab_end_session(
    state: State<'_, CollabManager>,
    doc_path: String,
) -> Result<(), String> {
    state.end_session(&doc_path);
    Ok(())
}

#[command]
pub fn collab_insert(
    state: State<'_, CollabManager>,
    doc_path: String,
    pos: usize,
    text: String,
) -> Result<CollabOperation, String> {
    state.apply_local(&doc_path, Operation::Insert { pos, text })
}

#[command]
pub fn collab_delete(
    state: State<'_, CollabManager>,
    doc_path: String,
    pos: usize,
    len: usize,
) -> Result<CollabOperation, String> {
    state.apply_local(&doc_path, Operation::Delete { pos, len })
}

#[command]
pub fn collab_apply_remote(
    state: State<'_, CollabManager>,
    operation: CollabOperation,
) -> Result<(), String> {
    state.apply_remote(&operation)
}

#[command]
pub fn collab_get_text(
    state: State<'_, CollabManager>,
    doc_path: String,
) -> Result<String, String> {
    state.get_text(&doc_path)
}

#[command]
pub fn collab_get_peers(
    state: State<'_, CollabManager>,
    doc_path: String,
) -> Result<Vec<PeerInfo>, String> {
    Ok(state.get_peers(&doc_path))
}

#[command]
pub fn collab_update_cursor(
    state: State<'_, CollabManager>,
    update: CursorUpdate,
) -> Result<(), String> {
    state.update_peer_cursor(&update.doc_path, &update);
    Ok(())
}

#[command]
pub fn collab_active_sessions(
    state: State<'_, CollabManager>,
) -> Result<Vec<String>, String> {
    Ok(state.active_sessions())
}
