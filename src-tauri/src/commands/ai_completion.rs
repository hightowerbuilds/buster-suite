use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{command, AppHandle, Emitter, Manager, State};
use tokio::sync::watch;
use futures_util::StreamExt;

// ── Types ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct CompletionRequest {
    pub request_id: u64,
    pub file_path: String,
    pub language: String,
    pub prefix: String,
    pub suffix: String,
    pub cursor_line: u32,
    pub cursor_col: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompletionToken {
    pub request_id: u64,
    pub token: String,
    pub done: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompletionError {
    pub request_id: u64,
    pub message: String,
}

// ── State ──────────────────────────────────────────────────────

pub struct AiCompletionState {
    cancel_tx: watch::Sender<bool>,
    cancel_rx: watch::Receiver<bool>,
    active_request: AtomicU64,
}

impl AiCompletionState {
    pub fn new() -> Self {
        let (cancel_tx, cancel_rx) = watch::channel(false);
        Self {
            cancel_tx,
            cancel_rx,
            active_request: AtomicU64::new(0),
        }
    }
}

// ── Commands ───────────────────────────────────────────────────

#[command]
pub async fn ai_completion_request(
    app: AppHandle,
    state: State<'_, AiCompletionState>,
    request: CompletionRequest,
) -> Result<(), String> {
    let settings = super::settings::load_settings(app.clone());
    if !settings.ai_completion_enabled {
        return Ok(());
    }

    // Cancel any existing request, then reset
    let _ = state.cancel_tx.send(true);
    let _ = state.cancel_tx.send(false);

    state.active_request.store(request.request_id, Ordering::Relaxed);

    let mut cancel_rx = state.cancel_rx.clone();
    let request_id = request.request_id;
    let app_handle = app.clone();

    tokio::spawn(async move {
        let result = match settings.ai_provider.as_str() {
            "ollama" => {
                stream_ollama(&app_handle, &settings, &request, &mut cancel_rx).await
            }
            "anthropic" => {
                stream_anthropic(&app_handle, &settings, &request, &mut cancel_rx).await
            }
            "openai" => {
                stream_openai(&app_handle, &settings, &request, &mut cancel_rx).await
            }
            _ => Err("Unknown AI provider".to_string()),
        };

        if let Err(e) = result {
            let _ = app_handle.emit("ai-completion-error", CompletionError {
                request_id,
                message: e,
            });
        }
    });

    Ok(())
}

#[command]
pub fn ai_completion_cancel(state: State<'_, AiCompletionState>) {
    let _ = state.cancel_tx.send(true);
}

// ── Prompt Building ────────────────────────────────────────────

fn build_chat_prompt(request: &CompletionRequest) -> String {
    format!(
        "Complete the code at the cursor position marked with <CURSOR>. Output ONLY the code that continues from the cursor. No markdown, no explanation, no backticks. Stop after the current statement or a few lines.\n\nFile: {}\n```{}\n{}<CURSOR>{}\n```",
        request.file_path,
        request.language,
        request.prefix,
        request.suffix,
    )
}

fn build_ollama_prompt(request: &CompletionRequest) -> String {
    // Simple completion prompt — prefix only, model continues
    format!(
        "// File: {}\n{}",
        request.file_path,
        request.prefix,
    )
}

// ── Ollama Provider ────────────────────────────────────────────

async fn stream_ollama(
    app: &AppHandle,
    settings: &super::settings::AppSettings,
    request: &CompletionRequest,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    let url = format!("{}/api/generate", settings.ai_ollama_url);
    let prompt = build_ollama_prompt(request);

    let body = serde_json::json!({
        "model": settings.ai_local_model,
        "prompt": prompt,
        "stream": true,
        "options": {
            "num_predict": 20,
            "num_ctx": 512,
            "temperature": 0.2,
            "stop": ["\n\n", "```"]
        }
    });

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama connection failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Ollama returned status {}", response.status()));
    }

    let request_id = request.request_id;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() { break; }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Parse complete NDJSON lines
                        while let Some(newline_pos) = buffer.find('\n') {
                            let line = buffer[..newline_pos].trim().to_string();
                            buffer.drain(..newline_pos + 1);

                            if line.is_empty() { continue; }

                            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                                let token = json.get("response")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let done = json.get("done")
                                    .and_then(|v| v.as_bool())
                                    .unwrap_or(false);

                                if !token.is_empty() {
                                    let _ = app.emit("ai-completion-token", CompletionToken {
                                        request_id,
                                        token,
                                        done,
                                    });
                                }

                                if done { return Ok(()); }
                            }
                        }
                    }
                    Some(Err(e)) => {
                        return Err(format!("Ollama stream error: {}", e));
                    }
                    None => {
                        // Stream ended
                        let _ = app.emit("ai-completion-token", CompletionToken {
                            request_id,
                            token: String::new(),
                            done: true,
                        });
                        return Ok(());
                    }
                }
            }
        }
    }

    Ok(())
}

// ── Anthropic Provider ─────────────────────────────────────────

async fn stream_anthropic(
    app: &AppHandle,
    settings: &super::settings::AppSettings,
    request: &CompletionRequest,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    if settings.ai_api_key.is_empty() {
        return Err("Anthropic API key not configured".to_string());
    }

    let prompt = build_chat_prompt(request);

    let body = serde_json::json!({
        "model": settings.ai_model,
        "max_tokens": 60,
        "stream": true,
        "system": "You are a code completion engine. Output ONLY the code that continues from the cursor position. No explanation, no markdown.",
        "messages": [{ "role": "user", "content": prompt }]
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &settings.ai_api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Anthropic returned {} — {}", status, body));
    }

    let request_id = request.request_id;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() { break; }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        // Parse SSE events (data: lines separated by \n\n)
                        while let Some(block_end) = buffer.find("\n\n") {
                            let block = buffer[..block_end].to_string();
                            buffer.drain(..block_end + 2);

                            for line in block.lines() {
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if data == "[DONE]" {
                                        let _ = app.emit("ai-completion-token", CompletionToken {
                                            request_id,
                                            token: String::new(),
                                            done: true,
                                        });
                                        return Ok(());
                                    }
                                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                                        if json.get("type").and_then(|v| v.as_str()) == Some("content_block_delta") {
                                            if let Some(text) = json.pointer("/delta/text").and_then(|v| v.as_str()) {
                                                if !text.is_empty() {
                                                    let _ = app.emit("ai-completion-token", CompletionToken {
                                                        request_id,
                                                        token: text.to_string(),
                                                        done: false,
                                                    });
                                                }
                                            }
                                        }
                                        if json.get("type").and_then(|v| v.as_str()) == Some("message_stop") {
                                            let _ = app.emit("ai-completion-token", CompletionToken {
                                                request_id,
                                                token: String::new(),
                                                done: true,
                                            });
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Err(e)) => return Err(format!("Anthropic stream error: {}", e)),
                    None => {
                        let _ = app.emit("ai-completion-token", CompletionToken {
                            request_id, token: String::new(), done: true,
                        });
                        return Ok(());
                    }
                }
            }
        }
    }

    Ok(())
}

// ── OpenAI Provider ────────────────────────────────────────────

async fn stream_openai(
    app: &AppHandle,
    settings: &super::settings::AppSettings,
    request: &CompletionRequest,
    cancel_rx: &mut watch::Receiver<bool>,
) -> Result<(), String> {
    if settings.ai_api_key.is_empty() {
        return Err("OpenAI API key not configured".to_string());
    }

    let prompt = build_chat_prompt(request);

    let body = serde_json::json!({
        "model": settings.ai_model,
        "max_tokens": 60,
        "stream": true,
        "temperature": 0.2,
        "messages": [
            { "role": "system", "content": "You are a code completion engine. Output ONLY the code that continues from the cursor position. No explanation, no markdown." },
            { "role": "user", "content": prompt }
        ]
    });

    let client = reqwest::Client::new();
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", settings.ai_api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI returned {} — {}", status, body));
    }

    let request_id = request.request_id;
    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    loop {
        tokio::select! {
            _ = cancel_rx.changed() => {
                if *cancel_rx.borrow() { break; }
            }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.push_str(&String::from_utf8_lossy(&bytes));

                        while let Some(block_end) = buffer.find("\n\n") {
                            let block = buffer[..block_end].to_string();
                            buffer.drain(..block_end + 2);

                            for line in block.lines() {
                                if let Some(data) = line.strip_prefix("data: ") {
                                    if data.trim() == "[DONE]" {
                                        let _ = app.emit("ai-completion-token", CompletionToken {
                                            request_id,
                                            token: String::new(),
                                            done: true,
                                        });
                                        return Ok(());
                                    }
                                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                                        if let Some(content) = json.pointer("/choices/0/delta/content").and_then(|v| v.as_str()) {
                                            if !content.is_empty() {
                                                let _ = app.emit("ai-completion-token", CompletionToken {
                                                    request_id,
                                                    token: content.to_string(),
                                                    done: false,
                                                });
                                            }
                                        }
                                        if json.pointer("/choices/0/finish_reason").and_then(|v| v.as_str()).is_some() {
                                            let _ = app.emit("ai-completion-token", CompletionToken {
                                                request_id,
                                                token: String::new(),
                                                done: true,
                                            });
                                            return Ok(());
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Some(Err(e)) => return Err(format!("OpenAI stream error: {}", e)),
                    None => {
                        let _ = app.emit("ai-completion-token", CompletionToken {
                            request_id, token: String::new(), done: true,
                        });
                        return Ok(());
                    }
                }
            }
        }
    }

    Ok(())
}
