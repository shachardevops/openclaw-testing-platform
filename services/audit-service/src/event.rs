use serde::{Deserialize, Serialize};

/// The audit event stored in the trail.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AuditEvent {
    pub seq: u64,
    pub ts: u64,
    #[serde(rename = "isoTime")]
    pub iso_time: String,
    pub category: String,
    pub action: String,
    pub actor: String,
    pub data: serde_json::Value,
    pub hash: Option<String>,
    #[serde(rename = "previousHash")]
    pub previous_hash: String,
}

/// Struct used to produce the JSON payload for hash computation.
/// Field order matches JS JSON.stringify key order exactly.
#[derive(Serialize)]
pub struct HashPayload {
    pub seq: u64,
    pub ts: u64,
    pub category: String,
    pub action: String,
    #[serde(rename = "previousHash")]
    pub previous_hash: String,
}
