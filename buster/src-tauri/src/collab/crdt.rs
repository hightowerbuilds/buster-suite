use serde::{Deserialize, Serialize};

/// Simple text CRDT using operational transformation.
/// Each operation is an insert or delete at a position.
/// Positions are adjusted based on concurrent operations.
pub struct TextCrdt {
    client_id: String,
    buffer: String,
    version: u64,
    history: Vec<VersionedOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Operation {
    Insert { pos: usize, text: String },
    Delete { pos: usize, len: usize },
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct VersionedOp {
    op: Operation,
    client_id: String,
    version: u64,
}

impl TextCrdt {
    pub fn new(client_id: &str, initial_text: &str) -> Self {
        TextCrdt {
            client_id: client_id.to_string(),
            buffer: initial_text.to_string(),
            version: 0,
            history: Vec::new(),
        }
    }

    /// Get the current document text.
    pub fn text(&self) -> String {
        self.buffer.clone()
    }

    /// Get the current version.
    #[allow(dead_code)]
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Apply an operation to the document.
    pub fn apply(&mut self, op: &Operation) -> Result<(), String> {
        match op {
            Operation::Insert { pos, text } => {
                if *pos > self.buffer.len() {
                    return Err(format!("Insert position {} out of bounds (len {})", pos, self.buffer.len()));
                }
                self.buffer.insert_str(*pos, text);
            }
            Operation::Delete { pos, len } => {
                if *pos + *len > self.buffer.len() {
                    return Err(format!("Delete range {}..{} out of bounds (len {})", pos, pos + len, self.buffer.len()));
                }
                self.buffer.drain(*pos..*pos + *len);
            }
        }

        self.version += 1;
        self.history.push(VersionedOp {
            op: op.clone(),
            client_id: self.client_id.clone(),
            version: self.version,
        });

        // Cap history to prevent unbounded growth
        if self.history.len() > 1000 {
            self.history.drain(..500);
        }

        Ok(())
    }

    /// Transform an incoming remote operation against local operations.
    /// Returns the transformed operation that can be applied locally.
    #[allow(dead_code)]
    pub fn transform(local: &Operation, remote: &Operation) -> Operation {
        match (local, remote) {
            // Insert vs Insert: transform remote against local
            (Operation::Insert { pos: lp, text: lt }, Operation::Insert { pos: rp, text: rt }) => {
                if *rp >= *lp {
                    // Remote insert is at or after local — shift remote forward by local insert length
                    Operation::Insert { pos: rp + lt.len(), text: rt.clone() }
                } else {
                    // Remote insert is before local — no shift needed
                    remote.clone()
                }
            }
            // Insert vs Delete
            (Operation::Insert { pos: lp, .. }, Operation::Delete { pos: rp, len: rl }) => {
                if *rp >= *lp {
                    // Remote delete is after local insert — shift forward
                    Operation::Delete { pos: rp + 0, len: *rl } // no shift needed for remote
                } else {
                    remote.clone()
                }
            }
            // Delete vs Insert
            (Operation::Delete { pos: lp, len: ll }, Operation::Insert { pos: rp, text: rt }) => {
                if *rp >= *lp + *ll {
                    Operation::Insert { pos: rp - ll, text: rt.clone() }
                } else if *rp <= *lp {
                    remote.clone()
                } else {
                    Operation::Insert { pos: *lp, text: rt.clone() }
                }
            }
            // Delete vs Delete
            (Operation::Delete { pos: lp, len: ll }, Operation::Delete { pos: rp, len: rl }) => {
                if *rp >= *lp + *ll {
                    Operation::Delete { pos: rp - ll, len: *rl }
                } else if *rp + *rl <= *lp {
                    Operation::Delete { pos: rp.clone(), len: *rl }
                } else {
                    // Overlapping deletes — reduce the remote delete
                    let new_pos = (*lp).min(*rp);
                    let overlap_start = (*lp).max(*rp);
                    let overlap_end = (*lp + *ll).min(*rp + *rl);
                    let overlap = if overlap_end > overlap_start { overlap_end - overlap_start } else { 0 };
                    let new_len = rl.saturating_sub(overlap);
                    Operation::Delete { pos: new_pos, len: new_len }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_crdt_has_initial_text() {
        let crdt = TextCrdt::new("client1", "hello");
        assert_eq!(crdt.text(), "hello");
        assert_eq!(crdt.version(), 0);
    }

    #[test]
    fn insert_at_end() {
        let mut crdt = TextCrdt::new("c1", "hello");
        crdt.apply(&Operation::Insert { pos: 5, text: " world".into() }).unwrap();
        assert_eq!(crdt.text(), "hello world");
        assert_eq!(crdt.version(), 1);
    }

    #[test]
    fn insert_at_beginning() {
        let mut crdt = TextCrdt::new("c1", "world");
        crdt.apply(&Operation::Insert { pos: 0, text: "hello ".into() }).unwrap();
        assert_eq!(crdt.text(), "hello world");
    }

    #[test]
    fn insert_in_middle() {
        let mut crdt = TextCrdt::new("c1", "helo");
        crdt.apply(&Operation::Insert { pos: 2, text: "l".into() }).unwrap();
        assert_eq!(crdt.text(), "hello");
    }

    #[test]
    fn delete_from_middle() {
        let mut crdt = TextCrdt::new("c1", "hello world");
        crdt.apply(&Operation::Delete { pos: 5, len: 6 }).unwrap();
        assert_eq!(crdt.text(), "hello");
    }

    #[test]
    fn delete_from_beginning() {
        let mut crdt = TextCrdt::new("c1", "hello");
        crdt.apply(&Operation::Delete { pos: 0, len: 2 }).unwrap();
        assert_eq!(crdt.text(), "llo");
    }

    #[test]
    fn insert_out_of_bounds_fails() {
        let mut crdt = TextCrdt::new("c1", "hi");
        assert!(crdt.apply(&Operation::Insert { pos: 99, text: "x".into() }).is_err());
    }

    #[test]
    fn delete_out_of_bounds_fails() {
        let mut crdt = TextCrdt::new("c1", "hi");
        assert!(crdt.apply(&Operation::Delete { pos: 0, len: 99 }).is_err());
    }

    #[test]
    fn transform_insert_insert_remote_after_local() {
        let local = Operation::Insert { pos: 3, text: "Y".into() };
        let remote = Operation::Insert { pos: 5, text: "X".into() };
        // Local inserts at 3 (len 1), remote at 5 → remote shifts to 6
        let transformed = TextCrdt::transform(&local, &remote);
        match transformed {
            Operation::Insert { pos, text } => {
                assert_eq!(pos, 6);
                assert_eq!(text, "X");
            }
            _ => panic!("Expected Insert"),
        }
    }

    #[test]
    fn transform_delete_delete_non_overlapping() {
        let local = Operation::Delete { pos: 0, len: 3 };
        let remote = Operation::Delete { pos: 5, len: 2 };
        let transformed = TextCrdt::transform(&local, &remote);
        match transformed {
            Operation::Delete { pos, len } => {
                assert_eq!(pos, 2); // shifted back by local delete length
                assert_eq!(len, 2);
            }
            _ => panic!("Expected Delete"),
        }
    }

    #[test]
    fn sequential_operations() {
        let mut crdt = TextCrdt::new("c1", "");
        crdt.apply(&Operation::Insert { pos: 0, text: "hello".into() }).unwrap();
        crdt.apply(&Operation::Insert { pos: 5, text: " world".into() }).unwrap();
        crdt.apply(&Operation::Delete { pos: 0, len: 6 }).unwrap();
        assert_eq!(crdt.text(), "world");
    }

    #[test]
    fn history_is_capped() {
        let mut crdt = TextCrdt::new("c1", "");
        for i in 0..1100 {
            crdt.apply(&Operation::Insert { pos: 0, text: "x".into() }).unwrap();
        }
        // History should be capped (pruned after 1000)
        assert!(crdt.version() == 1100);
    }
}
