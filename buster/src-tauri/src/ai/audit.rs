//! AI audit logger — writes JSONL records for every tool call and agent event.
//!
//! Log file: `~/.buster/ai-audit.jsonl`
//! Auto-rotates at 10 MB (renames to `.jsonl.1` and starts fresh).

use serde::Serialize;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

const MAX_LOG_SIZE: u64 = 10 * 1024 * 1024; // 10 MB

#[derive(Debug, Serialize)]
pub struct AuditEntry {
    pub timestamp: String,
    pub event: String,         // "tool_call", "tool_result", "text", "error", "done"
    pub tool_name: Option<String>,
    pub input_summary: Option<String>,
    pub output_summary: Option<String>,
    pub approved: Option<bool>,
    pub duration_ms: Option<u64>,
    pub model: Option<String>,
}

pub struct AuditLogger {
    log_path: Mutex<PathBuf>,
}

impl AuditLogger {
    pub fn new() -> Self {
        let dir = dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".buster");
        let _ = fs::create_dir_all(&dir);
        Self {
            log_path: Mutex::new(dir.join("ai-audit.jsonl")),
        }
    }

    pub fn log(&self, entry: &AuditEntry) {
        let path = self.log_path.lock().unwrap_or_else(|e| e.into_inner());

        // Check rotation
        if let Ok(meta) = fs::metadata(&*path) {
            if meta.len() > MAX_LOG_SIZE {
                let rotated = path.with_extension("jsonl.1");
                let _ = fs::rename(&*path, &rotated);
            }
        }

        // Write entry
        if let Ok(json) = serde_json::to_string(entry) {
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&*path)
            {
                let _ = writeln!(file, "{}", json);
            }
        }
    }

    pub fn log_tool_call(&self, tool_name: &str, input: &str, model: Option<&str>) {
        self.log(&AuditEntry {
            timestamp: now_iso(),
            event: "tool_call".to_string(),
            tool_name: Some(tool_name.to_string()),
            input_summary: Some(truncate(input, 500)),
            output_summary: None,
            approved: None,
            duration_ms: None,
            model: model.map(|s| s.to_string()),
        });
    }

    pub fn log_tool_result(&self, tool_name: &str, output: &str, duration_ms: u64) {
        self.log(&AuditEntry {
            timestamp: now_iso(),
            event: "tool_result".to_string(),
            tool_name: Some(tool_name.to_string()),
            input_summary: None,
            output_summary: Some(truncate(output, 500)),
            approved: None,
            duration_ms: Some(duration_ms),
            model: None,
        });
    }

    pub fn log_approval(&self, tool_name: &str, approved: bool) {
        self.log(&AuditEntry {
            timestamp: now_iso(),
            event: "tool_approval".to_string(),
            tool_name: Some(tool_name.to_string()),
            input_summary: None,
            output_summary: None,
            approved: Some(approved),
            duration_ms: None,
            model: None,
        });
    }

    pub fn log_event(&self, event: &str, content: &str, model: Option<&str>) {
        self.log(&AuditEntry {
            timestamp: now_iso(),
            event: event.to_string(),
            tool_name: None,
            input_summary: Some(truncate(content, 200)),
            output_summary: None,
            approved: None,
            duration_ms: None,
            model: model.map(|s| s.to_string()),
        });
    }
}

fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Compute UTC date/time without chrono dependency
    let s = secs % 60;
    let m = (secs / 60) % 60;
    let h = (secs / 3600) % 24;
    let mut days = secs / 86400;
    let mut y: u64 = 1970;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if days < days_in_year { break; }
        days -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days: [u64; 12] = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mon: u64 = 0;
    for md in &month_days {
        if days < *md { break; }
        days -= *md;
        mon += 1;
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mon + 1, days + 1, h, m, s)
}

fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        // Find a char boundary at or before `max` to avoid panicking on multi-byte UTF-8.
        let end = s.floor_char_boundary(max);
        format!("{}...", &s[..end])
    }
}
