use std::num::Wrapping;

/// Sanitize text by trimming whitespace. Returns None if empty.
fn sanitize_text(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// TF-IDF style embedding that produces identical output to the JS simpleEmbed function.
///
/// Uses i32 wrapping arithmetic to match JS `hash = hash & hash` behavior (32-bit signed int).
pub fn simple_embed(text: &str, dimensions: usize) -> Vec<f32> {
    let safe = match sanitize_text(text) {
        Some(s) => s,
        None => return vec![0.0; dimensions],
    };

    // Lowercase and remove non-alphanumeric/non-space characters
    let cleaned: String = safe
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c.is_ascii_whitespace() {
                c
            } else {
                ' '
            }
        })
        .collect();

    let tokens: Vec<&str> = cleaned.split_whitespace().filter(|s| !s.is_empty()).collect();

    let mut vector = vec![0.0f32; dimensions];

    for (i, token) in tokens.iter().enumerate() {
        // Hash computation matching JS: hash = ((hash << 5) - hash) + charCode; hash = hash & hash;
        let mut hash = Wrapping(0i32);
        for byte in token.bytes() {
            hash = (hash << 5) - hash + Wrapping(byte as i32);
            // hash & hash is identity in JS, but forces i32 — Wrapping<i32> already handles this
        }

        let hash_val = hash.0;

        for k in 0..3 {
            // Match JS: Math.abs((hash + k * 7919) % dimensions)
            let offset = Wrapping(hash_val) + Wrapping(k as i32) * Wrapping(7919i32);
            let dim_index = offset.0.wrapping_rem(dimensions as i32);
            let dim = dim_index.unsigned_abs() as usize % dimensions;
            vector[dim] += 1.0 / (1.0 + i as f32 * 0.1);
        }
    }

    // L2 normalize
    let mut norm: f32 = vector.iter().map(|v| v * v).sum();
    norm = norm.sqrt();
    if norm == 0.0 {
        norm = 1.0;
    }
    for v in vector.iter_mut() {
        *v /= norm;
    }

    vector
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simple_embed_dimensions() {
        let vec = simple_embed("hello world", 384);
        assert_eq!(vec.len(), 384);
    }

    #[test]
    fn test_simple_embed_normalized() {
        let vec = simple_embed("hello world", 384);
        let norm: f32 = vec.iter().map(|v| v * v).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-5, "Vector should be L2 normalized, got norm={}", norm);
    }

    #[test]
    fn test_simple_embed_empty() {
        let vec = simple_embed("", 384);
        assert_eq!(vec.len(), 384);
        assert!(vec.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn test_simple_embed_whitespace_only() {
        let vec = simple_embed("   ", 384);
        assert!(vec.iter().all(|&v| v == 0.0));
    }

    #[test]
    fn test_simple_embed_deterministic() {
        let v1 = simple_embed("test query", 384);
        let v2 = simple_embed("test query", 384);
        assert_eq!(v1, v2);
    }

    #[test]
    fn test_sanitize_text() {
        assert_eq!(sanitize_text("  hello  "), Some("hello".to_string()));
        assert_eq!(sanitize_text(""), None);
        assert_eq!(sanitize_text("   "), None);
    }
}
