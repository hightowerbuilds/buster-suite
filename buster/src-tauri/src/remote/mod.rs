use serde::{Deserialize, Serialize};
use ssh2::Session;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::sync::Mutex;

// buster-remote integration — connection pool, workspace sync, config
pub mod remote_pro {
    pub use buster_remote::{
        ConnectionPool, ConnectionState, WorkspaceSync, SyncState,
        RemoteHost, AuthMethod, SshConfig,
    };
}

/// Manages SSH connections to remote hosts.
pub struct RemoteManager {
    session: Mutex<Option<RemoteSession>>,
    /// buster-remote: connection pool for multi-host support
    pub pool: Mutex<remote_pro::ConnectionPool>,
    /// buster-remote: workspace sync state
    pub sync: Mutex<Option<remote_pro::WorkspaceSync>>,
}

struct RemoteSession {
    ssh: Session,
    host: String,
    user: String,
    remote_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFileContent {
    pub path: String,
    pub content: String,
    pub file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteConnectionInfo {
    pub host: String,
    pub user: String,
    pub remote_root: String,
    pub connected: bool,
}

impl RemoteManager {
    pub fn new() -> Self {
        RemoteManager {
            session: Mutex::new(None),
            pool: Mutex::new(remote_pro::ConnectionPool::default()),
            sync: Mutex::new(None),
        }
    }

    /// Connect to a remote host via SSH.
    /// Tries SSH agent first, then key file (~/.ssh/id_rsa, id_ed25519).
    pub fn connect(
        &self,
        host: &str,
        port: u16,
        user: &str,
        remote_root: &str,
        password: Option<&str>,
    ) -> Result<(), String> {
        let addr = format!("{}:{}", host, port);
        let tcp = TcpStream::connect(&addr)
            .map_err(|e| format!("Failed to connect to {}: {}", addr, e))?;
        tcp.set_read_timeout(Some(std::time::Duration::from_secs(10)))
            .map_err(|e| e.to_string())?;

        let mut ssh = Session::new()
            .map_err(|e| format!("Failed to create SSH session: {}", e))?;
        ssh.set_tcp_stream(tcp);
        ssh.handshake()
            .map_err(|e| format!("SSH handshake failed: {}", e))?;

        // Try authentication methods
        let authenticated = if let Some(pw) = password {
            // Password auth
            ssh.userauth_password(user, pw).is_ok()
        } else {
            // Try SSH agent first
            let agent_ok = ssh.userauth_agent(user).is_ok();
            if agent_ok {
                true
            } else {
                // Try common key files
                let home = dirs::home_dir().unwrap_or_default();
                let key_files = [
                    home.join(".ssh/id_ed25519"),
                    home.join(".ssh/id_rsa"),
                    home.join(".ssh/id_ecdsa"),
                ];
                let mut ok = false;
                for key in &key_files {
                    if key.exists() {
                        if ssh.userauth_pubkey_file(user, None, key, None).is_ok() {
                            ok = true;
                            break;
                        }
                    }
                }
                ok
            }
        };

        if !authenticated || !ssh.authenticated() {
            return Err("SSH authentication failed".to_string());
        }

        let mut session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        *session = Some(RemoteSession {
            ssh,
            host: host.to_string(),
            user: user.to_string(),
            remote_root: remote_root.to_string(),
        });

        Ok(())
    }

    /// Disconnect from the remote host.
    pub fn disconnect(&self) {
        let mut session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(s) = session.take() {
            let _ = s.ssh.disconnect(None, "Buster disconnect", None);
        }
    }

    /// Check if connected.
    #[allow(dead_code)]
    pub fn is_connected(&self) -> bool {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        session.is_some()
    }

    /// Get connection info.
    pub fn connection_info(&self) -> Option<RemoteConnectionInfo> {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        session.as_ref().map(|s| RemoteConnectionInfo {
            host: s.host.clone(),
            user: s.user.clone(),
            remote_root: s.remote_root.clone(),
            connected: true,
        })
    }

    /// List directory contents on the remote host.
    pub fn list_directory(&self, path: &str) -> Result<Vec<RemoteFileEntry>, String> {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let s = session.as_ref().ok_or("Not connected to remote host")?;

        let sftp = s.ssh.sftp()
            .map_err(|e| format!("SFTP failed: {}", e))?;

        let entries = sftp.readdir(Path::new(path))
            .map_err(|e| format!("Failed to list {}: {}", path, e))?;

        let mut result: Vec<RemoteFileEntry> = entries.iter()
            .filter_map(|(path, stat)| {
                let name = path.file_name()?.to_string_lossy().to_string();
                if name.starts_with('.') { return None; }
                Some(RemoteFileEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: stat.is_dir(),
                    size: stat.size.unwrap_or(0),
                })
            })
            .collect();

        result.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
        Ok(result)
    }

    /// Read a file from the remote host.
    pub fn read_file(&self, path: &str) -> Result<RemoteFileContent, String> {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let s = session.as_ref().ok_or("Not connected to remote host")?;

        let sftp = s.ssh.sftp()
            .map_err(|e| format!("SFTP failed: {}", e))?;

        let mut file = sftp.open(Path::new(path))
            .map_err(|e| format!("Failed to open {}: {}", path, e))?;

        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|e| format!("Failed to read {}: {}", path, e))?;

        let file_name = Path::new(path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string());

        Ok(RemoteFileContent {
            path: path.to_string(),
            content,
            file_name,
        })
    }

    /// Write a file to the remote host.
    pub fn write_file(&self, path: &str, content: &str) -> Result<(), String> {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let s = session.as_ref().ok_or("Not connected to remote host")?;

        let sftp = s.ssh.sftp()
            .map_err(|e| format!("SFTP failed: {}", e))?;

        let mut file = sftp.create(Path::new(path))
            .map_err(|e| format!("Failed to create {}: {}", path, e))?;

        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write {}: {}", path, e))?;

        Ok(())
    }

    /// Execute a command on the remote host and return stdout.
    pub fn exec_command(&self, cmd: &str) -> Result<String, String> {
        let session = self.session.lock().unwrap_or_else(|e| e.into_inner());
        let s = session.as_ref().ok_or("Not connected to remote host")?;

        let mut channel = s.ssh.channel_session()
            .map_err(|e| format!("Failed to open channel: {}", e))?;

        channel.exec(cmd)
            .map_err(|e| format!("Failed to exec: {}", e))?;

        let mut stdout = String::new();
        channel.read_to_string(&mut stdout)
            .map_err(|e| format!("Failed to read stdout: {}", e))?;

        channel.wait_close()
            .map_err(|e| format!("Channel close failed: {}", e))?;

        Ok(stdout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_manager_starts_disconnected() {
        let mgr = RemoteManager::new();
        assert!(!mgr.is_connected());
        assert!(mgr.connection_info().is_none());
    }

    #[test]
    fn disconnect_when_not_connected_is_ok() {
        let mgr = RemoteManager::new();
        mgr.disconnect(); // should not panic
        assert!(!mgr.is_connected());
    }
}
