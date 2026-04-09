pub mod crdt;

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use crdt::TextCrdt;

/// Manages collaborative editing sessions.
pub struct CollabManager {
    /// Active sessions by document path
    sessions: RwLock<HashMap<String, Arc<CollabSession>>>,
    /// This client's unique ID
    client_id: String,
}

#[allow(dead_code)]
pub struct CollabSession {
    pub doc_path: String,
    pub crdt: Mutex<TextCrdt>,
    pub peers: Mutex<Vec<PeerInfo>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PeerInfo {
    pub id: String,
    pub name: String,
    pub cursor_line: u32,
    pub cursor_col: u32,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollabOperation {
    pub client_id: String,
    pub doc_path: String,
    pub op: crdt::Operation,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorUpdate {
    pub client_id: String,
    pub doc_path: String,
    pub line: u32,
    pub col: u32,
}

impl CollabManager {
    pub fn new() -> Self {
        let client_id = format!("client_{}", std::process::id());
        CollabManager {
            sessions: RwLock::new(HashMap::new()),
            client_id,
        }
    }

    /// Get this client's ID.
    pub fn client_id(&self) -> &str {
        &self.client_id
    }

    /// Start a collaborative session for a document.
    pub fn start_session(&self, doc_path: &str, initial_text: &str) -> Result<(), String> {
        let mut sessions = self.sessions.write().map_err(|e| e.to_string())?;
        if sessions.contains_key(doc_path) {
            return Ok(()); // Already active
        }
        let crdt = TextCrdt::new(&self.client_id, initial_text);
        sessions.insert(doc_path.to_string(), Arc::new(CollabSession {
            doc_path: doc_path.to_string(),
            crdt: Mutex::new(crdt),
            peers: Mutex::new(Vec::new()),
        }));
        Ok(())
    }

    /// End a collaborative session.
    pub fn end_session(&self, doc_path: &str) {
        let mut sessions = self.sessions.write().unwrap_or_else(|e| e.into_inner());
        sessions.remove(doc_path);
    }

    /// Apply a local operation (from this client's editor).
    pub fn apply_local(&self, doc_path: &str, op: crdt::Operation) -> Result<CollabOperation, String> {
        let sessions = self.sessions.read().map_err(|e| e.to_string())?;
        let session = sessions.get(doc_path).ok_or("No active session")?;
        let mut crdt = session.crdt.lock().unwrap_or_else(|e| e.into_inner());
        crdt.apply(&op)?;
        Ok(CollabOperation {
            client_id: self.client_id.clone(),
            doc_path: doc_path.to_string(),
            op,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64,
        })
    }

    /// Apply a remote operation (from a peer).
    pub fn apply_remote(&self, collab_op: &CollabOperation) -> Result<(), String> {
        let sessions = self.sessions.read().map_err(|e| e.to_string())?;
        let session = sessions.get(&collab_op.doc_path).ok_or("No active session")?;
        let mut crdt = session.crdt.lock().unwrap_or_else(|e| e.into_inner());
        crdt.apply(&collab_op.op)
    }

    /// Update a peer's cursor position.
    pub fn update_peer_cursor(&self, doc_path: &str, update: &CursorUpdate) {
        let sessions = self.sessions.read().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = sessions.get(doc_path) {
            let mut peers = session.peers.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(peer) = peers.iter_mut().find(|p| p.id == update.client_id) {
                peer.cursor_line = update.line;
                peer.cursor_col = update.col;
            }
        }
    }

    /// Add a peer to a session.
    #[allow(dead_code)]
    pub fn add_peer(&self, doc_path: &str, peer: PeerInfo) {
        let sessions = self.sessions.read().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = sessions.get(doc_path) {
            let mut peers = session.peers.lock().unwrap_or_else(|e| e.into_inner());
            if !peers.iter().any(|p| p.id == peer.id) {
                peers.push(peer);
            }
        }
    }

    /// Remove a peer from a session.
    #[allow(dead_code)]
    pub fn remove_peer(&self, doc_path: &str, peer_id: &str) {
        let sessions = self.sessions.read().unwrap_or_else(|e| e.into_inner());
        if let Some(session) = sessions.get(doc_path) {
            let mut peers = session.peers.lock().unwrap_or_else(|e| e.into_inner());
            peers.retain(|p| p.id != peer_id);
        }
    }

    /// Get peers for a session.
    pub fn get_peers(&self, doc_path: &str) -> Vec<PeerInfo> {
        let sessions = self.sessions.read().unwrap_or_else(|e| e.into_inner());
        sessions.get(doc_path)
            .map(|s| s.peers.lock().unwrap_or_else(|e| e.into_inner()).clone())
            .unwrap_or_default()
    }

    /// Get the current document text from the CRDT.
    pub fn get_text(&self, doc_path: &str) -> Result<String, String> {
        let sessions = self.sessions.read().map_err(|e| e.to_string())?;
        let session = sessions.get(doc_path).ok_or("No active session")?;
        let crdt = session.crdt.lock().unwrap_or_else(|e| e.into_inner());
        Ok(crdt.text())
    }

    /// List active sessions.
    pub fn active_sessions(&self) -> Vec<String> {
        let sessions = self.sessions.read().unwrap_or_else(|e| e.into_inner());
        sessions.keys().cloned().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_and_end_session() {
        let mgr = CollabManager::new();
        mgr.start_session("test.rs", "hello").unwrap();
        assert_eq!(mgr.active_sessions().len(), 1);
        assert_eq!(mgr.get_text("test.rs").unwrap(), "hello");
        mgr.end_session("test.rs");
        assert_eq!(mgr.active_sessions().len(), 0);
    }

    #[test]
    fn apply_local_insert() {
        let mgr = CollabManager::new();
        mgr.start_session("test.rs", "hello").unwrap();
        mgr.apply_local("test.rs", crdt::Operation::Insert { pos: 5, text: " world".into() }).unwrap();
        assert_eq!(mgr.get_text("test.rs").unwrap(), "hello world");
    }

    #[test]
    fn peer_management() {
        let mgr = CollabManager::new();
        mgr.start_session("test.rs", "").unwrap();
        mgr.add_peer("test.rs", PeerInfo {
            id: "peer1".into(), name: "Alice".into(),
            cursor_line: 0, cursor_col: 0, color: "#f38ba8".into(),
        });
        assert_eq!(mgr.get_peers("test.rs").len(), 1);
        mgr.remove_peer("test.rs", "peer1");
        assert_eq!(mgr.get_peers("test.rs").len(), 0);
    }
}
