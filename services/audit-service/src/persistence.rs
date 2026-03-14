use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::event::AuditEvent;

/// On-disk format matching the JS audit-trail.json exactly.
#[derive(Serialize, Deserialize)]
pub struct AuditFile {
    pub version: u32,
    #[serde(rename = "updatedAt")]
    pub updated_at: String,
    pub sequence: u64,
    #[serde(rename = "lastHash")]
    pub last_hash: String,
    #[serde(rename = "totalEvents")]
    pub total_events: usize,
    pub events: Vec<AuditEvent>,
}

/// Load audit trail from disk. Returns None if file doesn't exist or is invalid.
pub fn load_from_disk(dir: &Path) -> Option<AuditFile> {
    let file_path = dir.join("audit-trail.json");
    let content = fs::read_to_string(file_path).ok()?;
    serde_json::from_str(&content).ok()
}

/// Save audit trail to disk.
pub fn save_to_disk(dir: &Path, data: &AuditFile) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let file_path = dir.join("audit-trail.json");
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Serialization failed: {e}"))?;

    // Write with trailing newline to match JS output
    let content = format!("{json}\n");
    fs::write(file_path, content).map_err(|e| format!("Write failed: {e}"))?;

    Ok(())
}
