//! Safe wrappers around the WASM host function imports.
//!
//! These functions are provided by Buster's WasmRuntime when the extension
//! is loaded. In a WASM build, they link to the actual host functions.
//! In a native test build, they use mock implementations.

/// Read a file relative to the workspace root.
///
/// Returns the file contents as a string, or an error message.
///
/// # Example
/// ```ignore
/// let content = buster_ext_sdk::read_file("src/main.rs")?;
/// ```
pub fn read_file(path: &str) -> Result<String, String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_read_file(path) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // Mock implementation for testing
        std::fs::read_to_string(path).map_err(|e| e.to_string())
    }
}

/// Write content to a file relative to the workspace root.
///
/// Requires write capability in the extension manifest.
pub fn write_file(path: &str, content: &str) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_write_file(path, content) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::write(path, content).map_err(|e| e.to_string())
    }
}

/// List files and directories at a path relative to the workspace root.
pub fn list_directory(path: &str) -> Result<Vec<String>, String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_list_directory(path) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let entries = std::fs::read_dir(path).map_err(|e| e.to_string())?;
        let mut names = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|e| e.to_string())?;
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
        Ok(names)
    }
}

/// Run a command in the sandbox.
///
/// The command must be on the sandbox allowlist. Returns (stdout, stderr, exit_code).
pub fn run_command(cmd: &str, args: &[&str]) -> Result<(String, String, i32), String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_run_command(cmd, args) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let output = std::process::Command::new(cmd)
            .args(args)
            .output()
            .map_err(|e| e.to_string())?;
        Ok((
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
            output.status.code().unwrap_or(-1),
        ))
    }
}

/// Log a message at the given level.
fn log_impl(level: &str, message: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_log(level, message) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        eprintln!("[{}] {}", level, message);
    }
}

pub fn log_debug(message: &str) { log_impl("debug", message); }
pub fn log_info(message: &str) { log_impl("info", message); }
pub fn log_warn(message: &str) { log_impl("warn", message); }
pub fn log_error(message: &str) { log_impl("error", message); }

/// Show a notification to the user.
pub fn notify(title: &str, message: &str) {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_notify(title, message) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        eprintln!("[NOTIFY] {}: {}", title, message);
    }
}

/// Set the return value for this extension call.
///
/// The value is serialized to JSON and returned to the caller.
pub fn set_return(value: &serde_json::Value) {
    let json = serde_json::to_string(value).unwrap_or_default();
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_set_return(&json) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        println!("{}", json);
    }
}

/// Text measurement results returned by `measure_text`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TextMetrics {
    pub width: f64,
    pub height: f64,
    pub ascent: f64,
    pub descent: f64,
}

/// Request a rendering surface. Returns a surface ID on success.
///
/// The surface is created with the given dimensions and a human-readable label
/// (used for debugging). The returned ID is used in subsequent paint / resize /
/// release calls.
pub fn request_surface(width: u32, height: u32, label: &str) -> Result<u32, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let raw: String = unsafe { _host_request_surface(width, height, label)? };
        raw.parse::<u32>().map_err(|e| e.to_string())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (width, height, label);
        Ok(1)
    }
}

/// Paint a display list to a surface.
///
/// `commands` is a slice of JSON values that represent drawing commands
/// understood by the host renderer.
pub fn paint(surface_id: u32, commands: &[serde_json::Value]) -> Result<(), String> {
    let json = serde_json::to_string(commands).map_err(|e| e.to_string())?;
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_paint(surface_id, &json) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (surface_id, json);
        Ok(())
    }
}

/// Resize a surface to new dimensions.
pub fn resize_surface(surface_id: u32, width: u32, height: u32) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_resize_surface(surface_id, width, height) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = (surface_id, width, height);
        Ok(())
    }
}

/// Release a surface, freeing any associated host resources.
pub fn release_surface(surface_id: u32) -> Result<(), String> {
    #[cfg(target_arch = "wasm32")]
    {
        unsafe { _host_release_surface(surface_id) }
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = surface_id;
        Ok(())
    }
}

/// Measure text dimensions using the host's text measurement engine.
///
/// `font` is a CSS-style font string (e.g. `"16px monospace"`).
/// The result includes width, height, ascent, and descent.
pub fn measure_text(text: &str, font: &str) -> Result<TextMetrics, String> {
    #[cfg(target_arch = "wasm32")]
    {
        let json: String = unsafe { _host_measure_text(text, font)? };
        serde_json::from_str(&json).map_err(|e| e.to_string())
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        // Mock: estimate 8px per character
        let _ = font;
        Ok(TextMetrics {
            width: text.len() as f64 * 8.0,
            height: 16.0,
            ascent: 12.0,
            descent: 4.0,
        })
    }
}

// WASM host function imports — these are linked by the Buster runtime.
#[cfg(target_arch = "wasm32")]
extern "C" {
    fn _host_read_file(path: &str) -> Result<String, String>;
    fn _host_write_file(path: &str, content: &str) -> Result<(), String>;
    fn _host_list_directory(path: &str) -> Result<Vec<String>, String>;
    fn _host_run_command(cmd: &str, args: &[&str]) -> Result<(String, String, i32), String>;
    fn _host_log(level: &str, message: &str);
    fn _host_notify(title: &str, message: &str);
    fn _host_set_return(json: &str);
    fn _host_request_surface(width: u32, height: u32, label: &str) -> Result<String, String>;
    fn _host_paint(surface_id: u32, commands_json: &str) -> Result<(), String>;
    fn _host_resize_surface(surface_id: u32, width: u32, height: u32) -> Result<(), String>;
    fn _host_release_surface(surface_id: u32) -> Result<(), String>;
    fn _host_measure_text(text: &str, font: &str) -> Result<String, String>;
}
