use serde::{Deserialize, Serialize};

/// Extension manifest — parsed from extension.toml in each extension directory.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionManifest {
    pub extension: ExtensionMeta,
    #[serde(default)]
    pub capabilities: Capabilities,
    #[serde(default)]
    pub services: Vec<ServiceDecl>,
    #[serde(default)]
    pub commands: Vec<CommandDecl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtensionMeta {
    pub id: String,
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub description: String,
}

fn default_version() -> String {
    "0.1.0".to_string()
}

/// Capabilities an extension can request.
/// Each field is opt-in — false by default.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Capabilities {
    /// Connect to external gateways (WebSocket, HTTP SSE)
    #[serde(default)]
    pub network: bool,
    /// Read files within the workspace
    #[serde(default)]
    pub workspace_read: bool,
    /// Write files within the workspace
    #[serde(default)]
    pub workspace_write: bool,
    /// Execute shell commands (sandboxed)
    #[serde(default)]
    pub commands: bool,
    /// Access the terminal
    #[serde(default)]
    pub terminal: bool,
    /// Show notifications to the user
    #[serde(default)]
    pub notifications: bool,
}

impl Capabilities {
    pub fn to_list(&self) -> Vec<String> {
        let mut out = Vec::new();
        if self.network { out.push("network".into()); }
        if self.workspace_read { out.push("workspace_read".into()); }
        if self.workspace_write { out.push("workspace_write".into()); }
        if self.commands { out.push("commands".into()); }
        if self.terminal { out.push("terminal".into()); }
        if self.notifications { out.push("notifications".into()); }
        out
    }
}

/// A long-running service the extension provides.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceDecl {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub auto_start: bool,
}

/// A command the extension contributes to the command palette.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDecl {
    pub id: String,
    pub label: String,
}
