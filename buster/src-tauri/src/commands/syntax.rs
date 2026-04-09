use tauri::{command, State};

use crate::syntax::{HighlightSpan, SyntaxService};

#[command]
pub fn highlight_code(
    state: State<'_, SyntaxService>,
    source: String,
    file_path: String,
) -> Result<Vec<HighlightSpan>, String> {
    let ext = SyntaxService::get_extension(&file_path);
    Ok(state.highlight(&source, &ext))
}

/// List all loaded syntax grammars (compiled + runtime WASM).
#[command]
pub fn syntax_languages(state: State<'_, SyntaxService>) -> Result<Vec<String>, String> {
    Ok(state.loaded_languages())
}
