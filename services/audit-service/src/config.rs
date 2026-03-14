use std::env;
use std::path::PathBuf;

pub struct Config {
    pub port: u16,
    pub max_memory_events: usize,
    pub max_file_events: usize,
    pub flush_interval_secs: u64,
    pub persist_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("AUDIT_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4002),
            max_memory_events: env::var("AUDIT_MAX_MEMORY_EVENTS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2000),
            max_file_events: env::var("AUDIT_MAX_FILE_EVENTS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(10000),
            flush_interval_secs: env::var("AUDIT_FLUSH_INTERVAL_SECS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(60),
            persist_dir: env::var("AUDIT_PERSIST_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from(".")),
        }
    }
}
