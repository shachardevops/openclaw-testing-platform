use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::embedding::simple_embed;
use crate::similarity::cosine_similarity;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct VectorEntry {
    pub id: String,
    pub vector: Vec<f32>,
    pub text: String,
    pub metadata: Value,
    pub inserted_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub score: f32,
    pub text: String,
    pub metadata: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CollectionStats {
    pub name: String,
    #[serde(rename = "vectorCount")]
    pub vector_count: usize,
    #[serde(rename = "maxVectors")]
    pub max_vectors: usize,
    pub dimensions: usize,
}

pub struct VectorCollection {
    pub name: String,
    pub dimensions: usize,
    pub max_vectors: usize,
    entries: Vec<VectorEntry>,
}

impl VectorCollection {
    pub fn new(name: &str, dimensions: usize, max_vectors: usize) -> Self {
        Self {
            name: name.to_string(),
            dimensions,
            max_vectors,
            entries: Vec::new(),
        }
    }

    /// Insert a vector entry. Text is truncated to 500 chars. FIFO eviction if at capacity.
    pub fn insert(&mut self, id: String, text: &str, metadata: Value) {
        // Truncate text to 500 chars
        let truncated: String = text.chars().take(500).collect();

        let vector = simple_embed(&truncated, self.dimensions);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        // Remove existing entry with same ID
        self.entries.retain(|e| e.id != id);

        // FIFO eviction
        while self.entries.len() >= self.max_vectors {
            self.entries.remove(0);
        }

        self.entries.push(VectorEntry {
            id,
            vector,
            text: truncated,
            metadata,
            inserted_at: now,
        });
    }

    /// Semantic search: embed query, compute cosine similarity against all entries.
    pub fn search(&self, query: &str, limit: usize, min_similarity: f32) -> Vec<SearchResult> {
        let query_vec = simple_embed(query, self.dimensions);

        let mut results: Vec<SearchResult> = self
            .entries
            .iter()
            .filter_map(|entry| {
                let score = cosine_similarity(&query_vec, &entry.vector);
                if score >= min_similarity {
                    Some(SearchResult {
                        id: entry.id.clone(),
                        score,
                        text: entry.text.clone(),
                        metadata: entry.metadata.clone(),
                    })
                } else {
                    None
                }
            })
            .collect();

        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        results
    }

    /// Keyword search: check if text or metadata contains the query (case-insensitive).
    pub fn keyword_search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let query_lower = query.to_lowercase();

        let mut results: Vec<SearchResult> = self
            .entries
            .iter()
            .filter(|entry| {
                let text_match = entry.text.to_lowercase().contains(&query_lower);
                let meta_match = serde_json::to_string(&entry.metadata)
                    .unwrap_or_default()
                    .to_lowercase()
                    .contains(&query_lower);
                text_match || meta_match
            })
            .map(|entry| SearchResult {
                id: entry.id.clone(),
                score: 1.0,
                text: entry.text.clone(),
                metadata: entry.metadata.clone(),
            })
            .collect();

        results.truncate(limit);
        results
    }

    /// Hybrid search: merge semantic + keyword results, keep higher score per ID.
    pub fn hybrid_search(&self, query: &str, limit: usize) -> Vec<SearchResult> {
        let semantic = self.search(query, limit, 0.0);
        let keyword = self.keyword_search(query, limit);

        let mut merged: HashMap<String, SearchResult> = HashMap::new();

        for r in semantic {
            merged.insert(r.id.clone(), r);
        }

        for r in keyword {
            merged
                .entry(r.id.clone())
                .and_modify(|existing| {
                    if r.score > existing.score {
                        existing.score = r.score;
                    }
                })
                .or_insert(r);
        }

        let mut results: Vec<SearchResult> = merged.into_values().collect();
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
        results.truncate(limit);
        results
    }

    pub fn get_stats(&self) -> CollectionStats {
        CollectionStats {
            name: self.name.clone(),
            vector_count: self.entries.len(),
            max_vectors: self.max_vectors,
            dimensions: self.dimensions,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_insert_and_search_roundtrip() {
        let mut col = VectorCollection::new("test", 384, 100);
        col.insert("doc1".to_string(), "rust programming language", json!({"type": "doc"}));
        col.insert("doc2".to_string(), "python programming language", json!({"type": "doc"}));
        col.insert("doc3".to_string(), "cooking recipes for dinner", json!({"type": "other"}));

        let results = col.search("rust programming", 10, 0.0);
        assert!(!results.is_empty(), "Should return at least one result");
        assert_eq!(results[0].id, "doc1", "Best match should be 'rust programming language'");
    }

    #[test]
    fn test_fifo_eviction() {
        let mut col = VectorCollection::new("test", 384, 2);
        col.insert("a".to_string(), "first", json!({}));
        col.insert("b".to_string(), "second", json!({}));
        col.insert("c".to_string(), "third", json!({}));

        let stats = col.get_stats();
        assert_eq!(stats.vector_count, 2, "Should evict oldest entry");
    }

    #[test]
    fn test_keyword_search() {
        let mut col = VectorCollection::new("test", 384, 100);
        col.insert("doc1".to_string(), "hello world", json!({}));
        col.insert("doc2".to_string(), "goodbye world", json!({}));

        let results = col.keyword_search("hello", 10);
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].id, "doc1");
        assert_eq!(results[0].score, 1.0);
    }

    #[test]
    fn test_hybrid_search() {
        let mut col = VectorCollection::new("test", 384, 100);
        col.insert("doc1".to_string(), "machine learning algorithms", json!({}));
        col.insert("doc2".to_string(), "deep learning neural networks", json!({}));

        let results = col.hybrid_search("learning", 10);
        assert!(results.len() >= 2, "Hybrid search should find both entries");
    }

    #[test]
    fn test_duplicate_id_replaces() {
        let mut col = VectorCollection::new("test", 384, 100);
        col.insert("doc1".to_string(), "original text", json!({}));
        col.insert("doc1".to_string(), "updated text", json!({}));

        let stats = col.get_stats();
        assert_eq!(stats.vector_count, 1, "Duplicate ID should replace, not add");
    }

    #[test]
    fn test_text_truncation() {
        let mut col = VectorCollection::new("test", 384, 100);
        let long_text = "a".repeat(1000);
        col.insert("doc1".to_string(), &long_text, json!({}));

        let results = col.keyword_search("a", 10);
        assert_eq!(results[0].text.len(), 500);
    }
}
