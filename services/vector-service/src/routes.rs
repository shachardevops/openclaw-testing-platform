use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;

use crate::collection::{SearchResult, VectorCollection};

pub struct AppState {
    pub collections: std::collections::HashMap<String, VectorCollection>,
    pub start_time: Instant,
    pub dimensions: usize,
}

pub type SharedState = Arc<RwLock<AppState>>;

// --- Health ---

pub async fn health_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let state = state.read().await;
    let uptime = state.start_time.elapsed().as_secs();
    Json(json!({
        "ok": true,
        "service": "vector",
        "uptime_seconds": uptime
    }))
}

// --- Status ---

pub async fn status_handler(State(state): State<SharedState>) -> impl IntoResponse {
    let state = state.read().await;
    let mut collections = json!({});

    for (name, col) in &state.collections {
        let stats = col.get_stats();
        collections[name] = serde_json::to_value(&stats).unwrap_or_default();
    }

    Json(json!({
        "ok": true,
        "enabled": true,
        "dimensions": state.dimensions,
        "collections": collections
    }))
}

// --- Insert ---

#[derive(Deserialize)]
pub struct InsertRequest {
    pub id: String,
    pub text: String,
    pub collection: String,
    #[serde(default)]
    pub metadata: Value,
}

pub async fn insert_handler(
    State(state): State<SharedState>,
    Json(body): Json<InsertRequest>,
) -> impl IntoResponse {
    let mut state = state.write().await;

    let col = match state.collections.get_mut(&body.collection) {
        Some(c) => c,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": format!("Unknown collection: {}", body.collection) })),
            );
        }
    };

    let metadata = if body.metadata.is_null() {
        json!({})
    } else {
        body.metadata
    };

    col.insert(body.id, &body.text, metadata);

    (StatusCode::OK, Json(json!({ "ok": true })))
}

// --- Search ---

#[derive(Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub collection: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default = "default_min_similarity")]
    pub min_similarity: f32,
}

fn default_limit() -> usize {
    10
}

fn default_min_similarity() -> f32 {
    0.5
}

fn results_to_json(results: Vec<SearchResult>) -> Vec<Value> {
    results
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "score": r.score,
                "text": r.text,
                "metadata": r.metadata
            })
        })
        .collect()
}

pub async fn search_handler(
    State(state): State<SharedState>,
    Json(body): Json<SearchRequest>,
) -> impl IntoResponse {
    let state = state.read().await;

    let col = match state.collections.get(&body.collection) {
        Some(c) => c,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": format!("Unknown collection: {}", body.collection) })),
            );
        }
    };

    let results = col.search(&body.query, body.limit, body.min_similarity);

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "results": results_to_json(results)
        })),
    )
}

// --- Hybrid Search ---

#[derive(Deserialize)]
pub struct HybridSearchRequest {
    pub query: String,
    pub collection: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

pub async fn hybrid_search_handler(
    State(state): State<SharedState>,
    Json(body): Json<HybridSearchRequest>,
) -> impl IntoResponse {
    let state = state.read().await;

    let col = match state.collections.get(&body.collection) {
        Some(c) => c,
        None => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "ok": false, "error": format!("Unknown collection: {}", body.collection) })),
            );
        }
    };

    let results = col.hybrid_search(&body.query, body.limit);

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "results": results_to_json(results)
        })),
    )
}

// --- Search All ---

#[derive(Deserialize)]
pub struct SearchAllRequest {
    pub query: String,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

#[derive(Serialize)]
struct SearchAllResult {
    id: String,
    score: f32,
    text: String,
    metadata: Value,
    collection: String,
}

pub async fn search_all_handler(
    State(state): State<SharedState>,
    Json(body): Json<SearchAllRequest>,
) -> impl IntoResponse {
    let state = state.read().await;

    let mut all_results: Vec<SearchAllResult> = Vec::new();

    for (name, col) in &state.collections {
        let results = col.hybrid_search(&body.query, body.limit);
        for r in results {
            all_results.push(SearchAllResult {
                id: r.id,
                score: r.score,
                text: r.text,
                metadata: r.metadata,
                collection: name.clone(),
            });
        }
    }

    all_results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    all_results.truncate(body.limit);

    let results_json: Vec<Value> = all_results
        .into_iter()
        .map(|r| {
            json!({
                "id": r.id,
                "score": r.score,
                "text": r.text,
                "metadata": r.metadata,
                "collection": r.collection
            })
        })
        .collect();

    (
        StatusCode::OK,
        Json(json!({
            "ok": true,
            "results": results_json
        })),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_values() {
        assert_eq!(default_limit(), 10);
        assert_eq!(default_min_similarity(), 0.5);
    }
}
