use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, Instant};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};

const DEBOUNCE_MS: u64 = 500;

pub struct FileWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    suppress_set: Arc<Mutex<HashSet<String>>>,
    debounce_map: Arc<Mutex<HashMap<String, Instant>>>,
    event_tx: mpsc::Sender<String>,
    event_rx: Mutex<Option<mpsc::Receiver<String>>>,
}

impl FileWatcher {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel();
        Self {
            watcher: Mutex::new(None),
            suppress_set: Arc::new(Mutex::new(HashSet::new())),
            debounce_map: Arc::new(Mutex::new(HashMap::new())),
            event_tx: tx,
            event_rx: Mutex::new(Some(rx)),
        }
    }

    /// Take the event receiver (called once during app setup).
    pub fn take_event_rx(&self) -> Option<mpsc::Receiver<String>> {
        self.event_rx.lock().unwrap().take()
    }

    /// Start the internal notify watcher.
    pub fn start(&self) -> Result<(), String> {
        let suppress = self.suppress_set.clone();
        let debounce = self.debounce_map.clone();
        let tx = self.event_tx.clone();

        let watcher = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                let event = match res {
                    Ok(e) => e,
                    Err(_) => return,
                };

                // Only care about data modifications and creates (overwrite)
                match event.kind {
                    EventKind::Modify(notify::event::ModifyKind::Data(_)) => {}
                    EventKind::Create(_) => {}
                    _ => return,
                }

                for path in &event.paths {
                    let canonical = match std::fs::canonicalize(path) {
                        Ok(p) => p.to_string_lossy().to_string(),
                        Err(_) => path.to_string_lossy().to_string(),
                    };

                    // Check self-save suppression
                    if let Ok(set) = suppress.lock() {
                        if set.contains(&canonical) {
                            continue;
                        }
                    }

                    // Per-path debounce
                    if let Ok(mut map) = debounce.lock() {
                        let now = Instant::now();
                        if let Some(last) = map.get(&canonical) {
                            if now.duration_since(*last) < Duration::from_millis(DEBOUNCE_MS) {
                                continue;
                            }
                        }
                        map.insert(canonical.clone(), now);
                    }

                    let _ = tx.send(canonical);
                }
            },
            Config::default(),
        )
        .map_err(|e| format!("Failed to create file watcher: {}", e))?;

        *self.watcher.lock().unwrap() = Some(watcher);
        Ok(())
    }

    /// Add a path to watch.
    pub fn watch(&self, path: &str) -> Result<(), String> {
        let canonical = std::fs::canonicalize(path)
            .map_err(|e| format!("Cannot watch {}: {}", path, e))?;

        if let Some(ref mut w) = *self.watcher.lock().unwrap() {
            w.watch(&canonical, RecursiveMode::NonRecursive)
                .map_err(|e| format!("Watch failed: {}", e))?;
        }
        Ok(())
    }

    /// Remove a path from watch.
    pub fn unwatch(&self, path: &str) -> Result<(), String> {
        let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| Path::new(path).to_path_buf());

        if let Some(ref mut w) = *self.watcher.lock().unwrap() {
            let _ = w.unwatch(&canonical); // Ignore errors (path may already be unwatched)
        }

        // Clean up debounce entry
        if let Ok(mut map) = self.debounce_map.lock() {
            map.remove(&canonical.to_string_lossy().to_string());
        }
        Ok(())
    }

    /// Suppress watcher events for a path (self-save). Automatically clears after 200ms.
    pub fn suppress_then_clear(&self, path: &str) {
        let canonical = std::fs::canonicalize(path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string());

        if let Ok(mut set) = self.suppress_set.lock() {
            set.insert(canonical.clone());
        }

        let suppress = self.suppress_set.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(200));
            if let Ok(mut set) = suppress.lock() {
                set.remove(&canonical);
            }
        });
    }
}
