use std::path::PathBuf;

use chrono::Utc;

use crate::config::Config;
use crate::event::AuditEvent;
use crate::hash_chain::compute_hash;
use crate::persistence::{self, AuditFile};

pub struct AuditStore {
    events: Vec<AuditEvent>,
    seq: u64,
    last_hash: String,
    dirty: bool,
    max_memory_events: usize,
    max_file_events: usize,
    persist_dir: PathBuf,
}

impl AuditStore {
    pub fn new(config: &Config) -> Self {
        let mut store = Self {
            events: Vec::new(),
            seq: 0,
            last_hash: "0000000000000000".to_string(),
            dirty: false,
            max_memory_events: config.max_memory_events,
            max_file_events: config.max_file_events,
            persist_dir: config.persist_dir.clone(),
        };

        store.load_from_disk();
        store
    }

    /// Record a new audit event. Returns the created event.
    pub fn record(
        &mut self,
        category: String,
        action: String,
        data: serde_json::Value,
        actor: String,
    ) -> AuditEvent {
        self.seq += 1;
        let now = Utc::now();
        let ts = now.timestamp_millis() as u64;
        let iso_time = now.to_rfc3339_opts(chrono::SecondsFormat::Millis, true);

        let mut event = AuditEvent {
            seq: self.seq,
            ts,
            iso_time,
            category,
            action,
            actor,
            data,
            hash: None,
            previous_hash: self.last_hash.clone(),
        };

        let hash = compute_hash(&event, &self.last_hash);
        event.hash = Some(hash.clone());
        self.last_hash = hash;

        self.events.push(event.clone());
        self.dirty = true;

        // Enforce memory limit (FIFO eviction)
        if self.events.len() > self.max_memory_events {
            let excess = self.events.len() - self.max_memory_events;
            self.events.drain(..excess);
        }

        event
    }

    /// Query events with optional filters. Returns most recent first.
    pub fn query(
        &self,
        category: Option<&str>,
        action: Option<&str>,
        task_id: Option<&str>,
        since: Option<u64>,
        limit: usize,
    ) -> Vec<AuditEvent> {
        let filtered: Vec<&AuditEvent> = self
            .events
            .iter()
            .filter(|e| {
                if let Some(cat) = category {
                    if e.category != cat {
                        return false;
                    }
                }
                if let Some(act) = action {
                    if e.action != act {
                        return false;
                    }
                }
                if let Some(tid) = task_id {
                    match e.data.get("taskId") {
                        Some(serde_json::Value::String(s)) if s == tid => {}
                        _ => return false,
                    }
                }
                if let Some(since_ts) = since {
                    if e.ts < since_ts {
                        return false;
                    }
                }
                true
            })
            .collect();

        // Return most recent first, limited
        filtered
            .into_iter()
            .rev()
            .take(limit)
            .cloned()
            .collect()
    }

    /// Replay all events for a specific task in chronological order.
    pub fn replay_task(&self, task_id: &str) -> Vec<AuditEvent> {
        let mut events: Vec<AuditEvent> = self
            .events
            .iter()
            .filter(|e| {
                matches!(e.data.get("taskId"), Some(serde_json::Value::String(s)) if s == task_id)
            })
            .cloned()
            .collect();

        events.sort_by_key(|e| e.seq);
        events
    }

    /// Verify hash chain integrity.
    pub fn verify_chain(&self) -> ChainVerification {
        let mut checked: u64 = 0;

        for event in &self.events {
            let hash = match &event.hash {
                Some(h) => h,
                None => continue,
            };
            checked += 1;
            let expected = compute_hash(event, &event.previous_hash);
            if *hash != expected {
                return ChainVerification {
                    valid: false,
                    broken_at: Some(event.seq),
                    checked,
                };
            }
        }

        ChainVerification {
            valid: true,
            broken_at: None,
            checked,
        }
    }

    /// Get current sequence number.
    pub fn sequence(&self) -> u64 {
        self.seq
    }

    /// Get total events in memory.
    pub fn total_events(&self) -> usize {
        self.events.len()
    }

    /// Load state from disk.
    fn load_from_disk(&mut self) {
        if let Some(data) = persistence::load_from_disk(&self.persist_dir) {
            self.events = data.events;
            self.seq = data.sequence;
            self.last_hash = data.last_hash;
        }
    }

    /// Flush current state to disk.
    pub fn flush_to_disk(&mut self) {
        if !self.dirty {
            return;
        }

        let events: Vec<AuditEvent> = if self.events.len() > self.max_file_events {
            self.events[self.events.len() - self.max_file_events..].to_vec()
        } else {
            self.events.clone()
        };

        let data = AuditFile {
            version: 1,
            updated_at: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            sequence: self.seq,
            last_hash: self.last_hash.clone(),
            total_events: events.len(),
            events,
        };

        if let Err(e) = persistence::save_to_disk(&self.persist_dir, &data) {
            tracing::warn!("[AuditTrail] Flush failed: {}", e);
        } else {
            self.dirty = false;
        }
    }
}

pub struct ChainVerification {
    pub valid: bool,
    pub broken_at: Option<u64>,
    pub checked: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;
    use std::path::PathBuf;

    fn test_config() -> Config {
        Config {
            port: 4002,
            max_memory_events: 100,
            max_file_events: 1000,
            flush_interval_secs: 60,
            persist_dir: PathBuf::from("/tmp/audit-test-nonexistent"),
        }
    }

    #[test]
    fn test_record_and_query_round_trip() {
        let config = test_config();
        let mut store = AuditStore::new(&config);

        let event = store.record(
            "task".to_string(),
            "run".to_string(),
            serde_json::json!({"taskId": "abc123"}),
            "system".to_string(),
        );

        assert_eq!(event.seq, 1);
        assert_eq!(event.category, "task");
        assert_eq!(event.action, "run");
        assert!(event.hash.is_some());

        // Query by category
        let results = store.query(Some("task"), None, None, None, 50);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].seq, 1);

        // Query by taskId
        let results = store.query(None, None, Some("abc123"), None, 50);
        assert_eq!(results.len(), 1);

        // Query with no match
        let results = store.query(Some("pipeline"), None, None, None, 50);
        assert!(results.is_empty());
    }

    #[test]
    fn test_verify_chain_on_sequence() {
        let config = test_config();
        let mut store = AuditStore::new(&config);

        for i in 0..5 {
            store.record(
                "task".to_string(),
                format!("action-{i}"),
                serde_json::json!({}),
                "system".to_string(),
            );
        }

        let verification = store.verify_chain();
        assert!(verification.valid);
        assert_eq!(verification.checked, 5);
        assert!(verification.broken_at.is_none());
    }

    #[test]
    fn test_verify_chain_detects_tampering() {
        let config = test_config();
        let mut store = AuditStore::new(&config);

        for _ in 0..3 {
            store.record(
                "task".to_string(),
                "run".to_string(),
                serde_json::json!({}),
                "system".to_string(),
            );
        }

        // Tamper with the second event's hash
        store.events[1].hash = Some("tampered_hash_val".to_string());

        let verification = store.verify_chain();
        assert!(!verification.valid);
        assert_eq!(verification.broken_at, Some(2));
    }

    #[test]
    fn test_query_returns_most_recent_first() {
        let config = test_config();
        let mut store = AuditStore::new(&config);

        for _ in 0..3 {
            store.record(
                "task".to_string(),
                "run".to_string(),
                serde_json::json!({}),
                "system".to_string(),
            );
        }

        let results = store.query(None, None, None, None, 50);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].seq, 3);
        assert_eq!(results[1].seq, 2);
        assert_eq!(results[2].seq, 1);
    }

    #[test]
    fn test_replay_task_chronological() {
        let config = test_config();
        let mut store = AuditStore::new(&config);

        store.record("task".to_string(), "start".to_string(), serde_json::json!({"taskId": "t1"}), "system".to_string());
        store.record("task".to_string(), "run".to_string(), serde_json::json!({"taskId": "t2"}), "system".to_string());
        store.record("task".to_string(), "complete".to_string(), serde_json::json!({"taskId": "t1"}), "system".to_string());

        let replay = store.replay_task("t1");
        assert_eq!(replay.len(), 2);
        assert_eq!(replay[0].action, "start");
        assert_eq!(replay[1].action, "complete");
        assert!(replay[0].seq < replay[1].seq);
    }

    #[test]
    fn test_memory_eviction() {
        let mut config = test_config();
        config.max_memory_events = 5;
        let mut store = AuditStore::new(&config);

        for _ in 0..10 {
            store.record("task".to_string(), "run".to_string(), serde_json::json!({}), "system".to_string());
        }

        assert_eq!(store.total_events(), 5);
        // Should keep the most recent 5 (seq 6..10)
        assert_eq!(store.events[0].seq, 6);
        assert_eq!(store.events[4].seq, 10);
    }
}
