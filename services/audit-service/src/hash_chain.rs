use sha2::{Digest, Sha256};

use crate::event::{AuditEvent, HashPayload};

/// Compute the truncated SHA-256 hash for an event, identical to the JS implementation.
///
/// The JSON is serialized with fields in this exact order:
/// seq, ts, category, action, previousHash
///
/// The result is the first 16 hex characters of the SHA-256 digest.
pub fn compute_hash(event: &AuditEvent, previous_hash: &str) -> String {
    let payload = HashPayload {
        seq: event.seq,
        ts: event.ts,
        category: event.category.clone(),
        action: event.action.clone(),
        previous_hash: previous_hash.to_string(),
    };

    let json = serde_json::to_string(&payload).expect("HashPayload serialization cannot fail");

    let mut hasher = Sha256::new();
    hasher.update(json.as_bytes());
    let digest = hasher.finalize();
    let hex_str = hex::encode(digest);

    hex_str[..16].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::event::AuditEvent;

    #[test]
    fn test_hash_is_16_char_hex() {
        let event = AuditEvent {
            seq: 1,
            ts: 1000,
            iso_time: String::new(),
            category: "task".to_string(),
            action: "run".to_string(),
            actor: "system".to_string(),
            data: serde_json::Value::Null,
            hash: None,
            previous_hash: "0000000000000000".to_string(),
        };

        let hash = compute_hash(&event, "0000000000000000");
        assert_eq!(hash.len(), 16);
        assert!(hash.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_hash_matches_js_output() {
        // The JS code does:
        //   JSON.stringify({"seq":1,"ts":1000,"category":"task","action":"run","previousHash":"0000000000000000"})
        // which produces: {"seq":1,"ts":1000,"category":"task","action":"run","previousHash":"0000000000000000"}
        //
        // We compute SHA-256 of that string and take the first 16 hex chars.
        let json_str = r#"{"seq":1,"ts":1000,"category":"task","action":"run","previousHash":"0000000000000000"}"#;

        // Compute expected hash directly
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(json_str.as_bytes());
        let digest = hasher.finalize();
        let expected = &hex::encode(digest)[..16];

        let event = AuditEvent {
            seq: 1,
            ts: 1000,
            iso_time: String::new(),
            category: "task".to_string(),
            action: "run".to_string(),
            actor: "system".to_string(),
            data: serde_json::Value::Null,
            hash: None,
            previous_hash: "0000000000000000".to_string(),
        };

        let hash = compute_hash(&event, "0000000000000000");
        assert_eq!(hash, expected);
    }
}
