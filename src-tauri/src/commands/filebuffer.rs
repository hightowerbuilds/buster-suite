use tauri::command;
use crate::filebuffer::FileBufferManager;
use crate::workspace::WorkspaceState;

/// Check file size and return whether it exceeds the large file threshold.
#[command]
pub fn file_is_large(path: String) -> Result<bool, String> {
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    Ok(meta.len() > crate::filebuffer::LARGE_FILE_THRESHOLD)
}

/// Open a large file in the Rust buffer manager. Returns total line count.
#[command]
pub fn large_file_open(
    path: String,
    state: tauri::State<WorkspaceState>,
    mgr: tauri::State<FileBufferManager>,
) -> Result<usize, String> {
    if let Some(root) = state.get() {
        crate::workspace::validate_path(&path, &root)?;
    }
    mgr.open(&path)
}

/// Read a range of lines from an open large file buffer.
#[command]
pub fn large_file_read_lines(
    path: String,
    start: usize,
    count: usize,
    mgr: tauri::State<FileBufferManager>,
) -> Result<Vec<String>, String> {
    mgr.read_lines(&path, start, count)
}

/// Get the total line count for an open large file buffer.
#[command]
pub fn large_file_line_count(
    path: String,
    mgr: tauri::State<FileBufferManager>,
) -> Result<usize, String> {
    mgr.line_count(&path)
}

/// Close a large file buffer and free memory.
#[command]
pub fn large_file_close(
    path: String,
    mgr: tauri::State<FileBufferManager>,
) -> Result<(), String> {
    mgr.close(&path);
    Ok(())
}
