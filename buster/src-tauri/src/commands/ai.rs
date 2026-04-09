use tauri::{command, AppHandle, Emitter};
use serde_json::json;
use std::sync::Arc;

use crate::ai::agent::{AgentConfig, AgentEvent, ApprovalManager, run_agent};
use crate::ai::audit::AuditLogger;

const KEYRING_SERVICE: &str = "buster";
const KEYRING_USER: &str = "api-key";

#[derive(serde::Deserialize)]
pub struct AiChatRequest {
    pub prompt: String,
    pub api_key: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub base_url: Option<String>,
    pub workspace_root: Option<String>,
}

#[command]
pub async fn ai_chat(
    app: AppHandle,
    request: AiChatRequest,
    state: tauri::State<'_, Arc<ApprovalManager>>,
    audit: tauri::State<'_, AuditLogger>,
) -> Result<(), String> {
    // Load settings for configurable rate limits
    let settings = crate::commands::settings::load_settings(app.clone());
    let config = AgentConfig {
        api_key: request.api_key,
        model: request.model.unwrap_or_else(|| "claude-sonnet-4-6".to_string()),
        provider: request.provider.unwrap_or_else(|| "anthropic".to_string()),
        base_url: request.base_url,
        max_tool_calls: settings.agent_max_tool_calls,
        max_writes: settings.agent_max_writes,
        max_commands: settings.agent_max_commands,
        timeout_secs: settings.agent_timeout_secs as u64,
    };

    let app_handle = app.clone();
    let approval_mgr = Arc::clone(&state);
    let logger = &*audit;
    run_agent(
        &config,
        &request.prompt,
        request.workspace_root.as_deref(),
        move |event: AgentEvent| {
            let _ = app_handle.emit("ai-event", &event);
        },
        approval_mgr,
        Some(logger),
    )
    .await;

    Ok(())
}

#[command]
pub async fn ai_approve_tool(
    request_id: String,
    approved: bool,
    state: tauri::State<'_, Arc<ApprovalManager>>,
) -> Result<(), String> {
    if let Some(sender) = state.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&request_id) {
        let _ = sender.send(approved);
    }
    Ok(())
}

/// Cancel a running agent.
#[command]
pub async fn ai_cancel(
    state: tauri::State<'_, Arc<ApprovalManager>>,
) -> Result<(), String> {
    state.cancel();
    Ok(())
}

/// Single-turn inline completion (no tool use, no agent loop).
#[command]
pub async fn ai_inline_complete(
    api_key: String,
    before: String,
    after: String,
    file_path: String,
) -> Result<String, String> {
    let ext = file_path.rsplit('.').next().unwrap_or("");
    let client = reqwest::Client::new();

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&json!({
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 256,
            "system": format!(
                "You are an inline code completion engine for a {} file. \
                 Output ONLY the code that should be inserted at the cursor position. \
                 No explanation, no markdown, no backticks. Just the raw code completion.",
                ext
            ),
            "messages": [{
                "role": "user",
                "content": format!(
                    "Complete the code at <CURSOR>:\n\n{}<CURSOR>{}",
                    before, after
                )
            }]
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    let text = body
        .get("content")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|block| block.get("text"))
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    Ok(text)
}

#[command]
pub fn store_api_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

#[command]
pub fn load_api_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[command]
pub fn delete_api_key() -> Result<(), String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
