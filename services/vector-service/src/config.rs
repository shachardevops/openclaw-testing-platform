use std::env;

pub struct Config {
    pub port: u16,
    pub dimensions: usize,
    pub max_learnings: usize,
    pub max_decisions: usize,
    pub max_patterns: usize,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("VECTOR_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4001),
            dimensions: env::var("VECTOR_DIMENSIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(384),
            max_learnings: env::var("VECTOR_MAX_LEARNINGS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(5000),
            max_decisions: env::var("VECTOR_MAX_DECISIONS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(2000),
            max_patterns: env::var("VECTOR_MAX_PATTERNS")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(3000),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_defaults() {
        let config = Config::from_env();
        assert_eq!(config.dimensions, 384);
    }
}
