use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tokio::sync::{oneshot, Notify};

use super::tools;

/// Manages pending tool-approval requests and agent cancellation.
/// Shared between the agent loop (which awaits approval) and the
/// `ai_approve_tool` / `ai_cancel` Tauri commands.
pub struct ApprovalManager {
    pub pending: Mutex<HashMap<String, oneshot::Sender<bool>>>,
    counter: AtomicU64,
    /// Set to true to request the agent loop to stop after its current step.
    cancelled: AtomicBool,
    /// Notified immediately on cancel so in-flight awaits can abort.
    cancel_notify: Notify,
}

impl ApprovalManager {
    pub fn new() -> Self {
        Self {
            pending: Mutex::new(HashMap::new()),
            counter: AtomicU64::new(1),
            cancelled: AtomicBool::new(false),
            cancel_notify: Notify::new(),
        }
    }

    pub fn next_id(&self) -> String {
        let n = self.counter.fetch_add(1, Ordering::Relaxed);
        format!("approval-{}", n)
    }

    /// Request cancellation of the running agent.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::Relaxed);
        // Wake any in-flight select! that is waiting on the cancel signal
        self.cancel_notify.notify_waiters();
        // Also resolve any pending approval as denied so the agent doesn't block
        let mut pending = self.pending.lock().unwrap_or_else(|e| e.into_inner());
        for (_, sender) in pending.drain() {
            let _ = sender.send(false);
        }
    }

    /// Check if cancellation was requested.
    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Relaxed)
    }

    /// Returns a future that resolves when cancel is requested.
    pub async fn cancelled(&self) {
        if self.is_cancelled() { return; }
        self.cancel_notify.notified().await;
    }

    /// Reset cancellation flag (call before starting a new agent run).
    pub fn reset(&self) {
        self.cancelled.store(false, Ordering::Relaxed);
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentEvent {
    pub kind: String, // "text", "tool_call", "tool_result", "done", "error"
    pub content: String,
    pub tool_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message {
    role: String,
    content: Value,
}

pub struct AgentConfig {
    pub api_key: String,
    pub model: String,
    pub provider: String, // "anthropic" or "ollama"
    pub base_url: Option<String>,
    // Rate limits (configurable via settings)
    pub max_tool_calls: u32,
    pub max_writes: u32,
    pub max_commands: u32,
    pub timeout_secs: u64,
}

impl Default for AgentConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "claude-sonnet-4-6".to_string(),
            provider: "anthropic".to_string(),
            base_url: None,
            max_tool_calls: 50,
            max_writes: 10,
            max_commands: 5,
            timeout_secs: 300,
        }
    }
}

const SYSTEM_PROMPT: &str = r#"You are an AI coding assistant integrated into Buster, a lightweight canvas-rendered IDE built with Tauri and Rust. You help users with their code by reading files, writing files, searching codebases, and running commands.

When asked to make changes:
1. Read the relevant files first to understand the current state
2. Make targeted edits — don't rewrite entire files unless asked
3. Explain what you're doing briefly
4. Run any relevant commands (tests, builds) to verify your changes

When asked questions:
1. Read the relevant code to give accurate answers
2. Reference specific file paths and line numbers
3. Be concise

You have access to the user's workspace. Use the tools to interact with their files and terminal."#;

/// Run the agentic loop: send prompt, handle tool calls, loop until done.
/// Emits events via the callback for streaming to the frontend.
/// State-changing tools pause for user approval via `approval_mgr`.
pub async fn run_agent(
    config: &AgentConfig,
    prompt: &str,
    workspace_root: Option<&str>,
    on_event: impl Fn(AgentEvent) + Send + Sync + 'static,
    approval_mgr: Arc<ApprovalManager>,
    audit: Option<&super::audit::AuditLogger>,
) {
    let client = Client::new();
    let on_event = Arc::new(on_event);

    // Reset cancellation flag from any previous run
    approval_mgr.reset();

    if let Some(logger) = audit {
        logger.log_event("agent_start", prompt, Some(&config.model));
    }

    let mut messages: Vec<Message> = vec![
        Message {
            role: "user".to_string(),
            content: Value::String(prompt.to_string()),
        },
    ];

    let tool_defs = tools::tool_definitions();
    let max_iterations = 20;

    // Per-session rate limits (from config, configurable via settings)
    let mut total_tool_calls: u32 = 0;
    let mut write_calls: u32 = 0;
    let mut command_calls: u32 = 0;
    let mut total_output_bytes: usize = 0;
    let max_tool_calls = config.max_tool_calls;
    let max_writes = config.max_writes;
    let max_commands = config.max_commands;
    const MAX_OUTPUT_BYTES: usize = 512 * 1024; // 500 KB
    let session_start = std::time::Instant::now();
    let session_timeout = std::time::Duration::from_secs(config.timeout_secs);

    // Warn if provider doesn't support tool use
    if config.provider != "anthropic" {
        on_event(AgentEvent {
            kind: "text".to_string(),
            content: format!("Note: Tool use (file read/write, commands) is not available with the {} provider. The agent can only respond with text.", config.provider),
            tool_name: None,
        });
    }

    for _iteration in 0..max_iterations {
        // Check wall-clock timeout
        if session_start.elapsed() > session_timeout {
            on_event(AgentEvent {
                kind: "error".to_string(),
                content: "Agent session timed out (5 minutes)".to_string(),
                tool_name: None,
            });
            return;
        }

        // Check for cancellation at the start of each iteration
        if approval_mgr.is_cancelled() {
            on_event(AgentEvent {
                kind: "error".to_string(),
                content: "Agent cancelled by user".to_string(),
                tool_name: None,
            });
            return;
        }

        // Build request
        let (url, headers, body) = match config.provider.as_str() {
            "anthropic" => build_anthropic_request(config, &messages, &tool_defs),
            "ollama" => build_ollama_request(config, &messages),
            _ => {
                on_event(AgentEvent {
                    kind: "error".to_string(),
                    content: format!("Unknown provider: {}", config.provider),
                    tool_name: None,
                });
                return;
            }
        };

        // Send request — cancellable via tokio::select!
        let request_fut = client
            .post(&url)
            .headers(headers)
            .json(&body)
            .send();

        let response = tokio::select! {
            biased;
            _ = approval_mgr.cancelled() => {
                on_event(AgentEvent {
                    kind: "error".to_string(),
                    content: "Agent cancelled by user".to_string(),
                    tool_name: None,
                });
                return;
            }
            result = request_fut => {
                match result {
                    Ok(r) => r,
                    Err(e) => {
                        on_event(AgentEvent {
                            kind: "error".to_string(),
                            content: format!("API request failed: {}", e),
                            tool_name: None,
                        });
                        return;
                    }
                }
            }
        };

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            on_event(AgentEvent {
                kind: "error".to_string(),
                content: format!("API error {}: {}", status, body),
                tool_name: None,
            });
            return;
        }

        // Parse response
        let resp_body: Value = match response.json().await {
            Ok(v) => v,
            Err(e) => {
                on_event(AgentEvent {
                    kind: "error".to_string(),
                    content: format!("Failed to parse response: {}", e),
                    tool_name: None,
                });
                return;
            }
        };

        // Extract content blocks (Anthropic format)
        let content_blocks = resp_body["content"].as_array();
        let stop_reason = resp_body["stop_reason"].as_str().unwrap_or("end_turn");

        let mut has_tool_use = false;
        let mut tool_results: Vec<Value> = Vec::new();
        let mut assistant_content: Vec<Value> = Vec::new();

        if let Some(blocks) = content_blocks {
            for block in blocks {
                let block_type = block["type"].as_str().unwrap_or("");

                match block_type {
                    "text" => {
                        let text = block["text"].as_str().unwrap_or("");
                        if !text.is_empty() {
                            on_event(AgentEvent {
                                kind: "text".to_string(),
                                content: text.to_string(),
                                tool_name: None,
                            });
                        }
                        assistant_content.push(block.clone());
                    }
                    "tool_use" => {
                        has_tool_use = true;
                        let tool_name = block["name"].as_str().unwrap_or("");
                        let tool_id = block["id"].as_str().unwrap_or("");
                        let input = &block["input"];

                        let input_str = serde_json::to_string(input).unwrap_or_default();

                        on_event(AgentEvent {
                            kind: "tool_call".to_string(),
                            content: format!("{}({})", tool_name, &input_str),
                            tool_name: Some(tool_name.to_string()),
                        });

                        if let Some(logger) = audit {
                            logger.log_tool_call(tool_name, &input_str, Some(&config.model));
                        }

                        // Rate limit checks
                        total_tool_calls += 1;
                        if total_tool_calls > max_tool_calls {
                            on_event(AgentEvent {
                                kind: "error".to_string(),
                                content: format!("Rate limit: exceeded {} total tool calls", max_tool_calls),
                                tool_name: None,
                            });
                            return;
                        }
                        if tool_name == "write_file" {
                            write_calls += 1;
                            if write_calls > max_writes {
                                on_event(AgentEvent {
                                    kind: "error".to_string(),
                                    content: format!("Rate limit: exceeded {} file writes", max_writes),
                                    tool_name: None,
                                });
                                return;
                            }
                        }
                        if tool_name == "run_command" {
                            command_calls += 1;
                            if command_calls > max_commands {
                                on_event(AgentEvent {
                                    kind: "error".to_string(),
                                    content: format!("Rate limit: exceeded {} command executions", max_commands),
                                    tool_name: None,
                                });
                                return;
                            }
                        }

                        let ws = workspace_root.unwrap_or(".");
                        let tool_start = std::time::Instant::now();

                        let result = if tools::is_read_only(tool_name) {
                            // Read-only tools: run in spawn_blocking, cancellable
                            let tool_name_owned = tool_name.to_string();
                            let input_owned = input.clone();
                            let ws_owned = ws.to_string();
                            let tool_handle = tokio::task::spawn_blocking(move || {
                                tools::execute_tool(&tool_name_owned, &input_owned, &ws_owned)
                            });
                            let abort = tool_handle.abort_handle();
                            tokio::select! {
                                biased;
                                _ = approval_mgr.cancelled() => {
                                    abort.abort();
                                    on_event(AgentEvent {
                                        kind: "error".to_string(),
                                        content: "Agent cancelled by user".to_string(),
                                        tool_name: None,
                                    });
                                    return;
                                }
                                result = tool_handle => {
                                    result.unwrap_or_else(|_| "Tool execution was cancelled".to_string())
                                }
                            }
                        } else {
                            let request_id = approval_mgr.next_id();
                            let (tx, rx) = oneshot::channel::<bool>();
                            approval_mgr.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(request_id.clone(), tx);

                            on_event(AgentEvent {
                                kind: "tool_approval".to_string(),
                                content: json!({
                                    "request_id": request_id,
                                    "tool_name": tool_name,
                                    "tool_input": input,
                                }).to_string(),
                                tool_name: Some(tool_name.to_string()),
                            });

                            // 60-second timeout for user decision, cancellable
                            let approved = tokio::select! {
                                biased;
                                _ = approval_mgr.cancelled() => {
                                    approval_mgr.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&request_id);
                                    on_event(AgentEvent {
                                        kind: "error".to_string(),
                                        content: "Agent cancelled by user".to_string(),
                                        tool_name: None,
                                    });
                                    return;
                                }
                                result = tokio::time::timeout(std::time::Duration::from_secs(60), rx) => {
                                    match result {
                                        Ok(Ok(true)) => true,
                                        _ => {
                                            approval_mgr.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&request_id);
                                            false
                                        }
                                    }
                                }
                            };

                            if let Some(logger) = audit {
                                logger.log_approval(tool_name, approved);
                            }

                            if approved {
                                // State-changing tools: run async for run_command, blocking for others
                                if tool_name == "run_command" || tool_name == "search_files" {
                                    let cancel_mgr = approval_mgr.clone();
                                    tools::execute_tool_async(tool_name, input, ws, cancel_mgr).await
                                } else {
                                    tools::execute_tool(tool_name, input, ws)
                                }
                            } else {
                                "Tool execution denied by user".to_string()
                            }
                        };

                        let duration_ms = tool_start.elapsed().as_millis() as u64;

                        // Track cumulative output size
                        total_output_bytes += result.len();
                        if total_output_bytes > MAX_OUTPUT_BYTES {
                            on_event(AgentEvent {
                                kind: "error".to_string(),
                                content: format!("Rate limit: total output exceeded {} KB", MAX_OUTPUT_BYTES / 1024),
                                tool_name: None,
                            });
                            return;
                        }

                        if let Some(logger) = audit {
                            logger.log_tool_result(tool_name, &result, duration_ms);
                        }

                        on_event(AgentEvent {
                            kind: "tool_result".to_string(),
                            content: if result.len() > 500 {
                                let end = result.floor_char_boundary(500);
                                format!("{}... ({} chars)", &result[..end], result.len())
                            } else {
                                result.clone()
                            },
                            tool_name: Some(tool_name.to_string()),
                        });

                        assistant_content.push(block.clone());
                        tool_results.push(json!({
                            "type": "tool_result",
                            "tool_use_id": tool_id,
                            "content": result,
                        }));
                    }
                    _ => {
                        assistant_content.push(block.clone());
                    }
                }
            }
        }

        // Add assistant message to history
        messages.push(Message {
            role: "assistant".to_string(),
            content: Value::Array(assistant_content),
        });

        // If there were tool calls, add results and continue the loop
        if has_tool_use && stop_reason == "tool_use" {
            messages.push(Message {
                role: "user".to_string(),
                content: Value::Array(tool_results),
            });
            continue;
        }

        // Done — no more tool calls
        on_event(AgentEvent {
            kind: "done".to_string(),
            content: String::new(),
            tool_name: None,
        });
        return;
    }

    on_event(AgentEvent {
        kind: "error".to_string(),
        content: "Agent reached maximum iterations (20)".to_string(),
        tool_name: None,
    });
}

fn build_anthropic_request(
    config: &AgentConfig,
    messages: &[Message],
    tools: &[Value],
) -> (String, reqwest::header::HeaderMap, Value) {
    let url = config.base_url.clone().unwrap_or_else(|| "https://api.anthropic.com/v1/messages".to_string());

    let mut headers = reqwest::header::HeaderMap::new();
    if let Ok(key) = config.api_key.parse() {
        headers.insert("x-api-key", key);
    }
    headers.insert("anthropic-version", "2023-06-01".parse().unwrap());
    headers.insert("content-type", "application/json".parse().unwrap());

    let body = json!({
        "model": config.model,
        "max_tokens": 8192,
        "system": SYSTEM_PROMPT,
        "tools": tools,
        "messages": messages,
    });

    (url, headers, body)
}

fn build_ollama_request(
    config: &AgentConfig,
    messages: &[Message],
) -> (String, reqwest::header::HeaderMap, Value) {
    let url = config.base_url.clone().unwrap_or_else(|| "http://localhost:11434/api/chat".to_string());

    let headers = reqwest::header::HeaderMap::new();

    // Convert messages to Ollama format
    let ollama_messages: Vec<Value> = std::iter::once(json!({
        "role": "system",
        "content": SYSTEM_PROMPT,
    }))
    .chain(messages.iter().map(|m| {
        json!({
            "role": m.role,
            "content": match &m.content {
                Value::String(s) => s.clone(),
                Value::Array(arr) => {
                    arr.iter()
                        .filter_map(|b| b["text"].as_str().map(String::from))
                        .collect::<Vec<_>>()
                        .join("\n")
                }
                _ => String::new(),
            },
        })
    }))
    .collect();

    let body = json!({
        "model": config.model,
        "messages": ollama_messages,
        "stream": false,
    });

    (url, headers, body)
}
