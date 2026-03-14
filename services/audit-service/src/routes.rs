use std::sync::Arc;
use std::time::Instant;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::Json;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::store::AuditStore;

/// Shared application state.
pub struct AppState {
    pub store: RwLock<AuditStore>,
    pub start_time: Instant,
}

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct HealthResponse {
    ok: bool,
    service: String,
    uptime_seconds: u64,
}

pub async fn health(State(state): State<Arc<AppState>>) -> Json<HealthResponse> {
    Json(HealthResponse {
        ok: true,
        service: "audit".to_string(),
        uptime_seconds: state.start_time.elapsed().as_secs(),
    })
}

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct StatusResponse {
    ok: bool,
    enabled: bool,
    #[serde(rename = "totalEvents")]
    total_events: usize,
    sequence: u64,
    #[serde(rename = "chainValidation")]
    chain_validation: bool,
    #[serde(rename = "chainIntegrity")]
    chain_integrity: ChainIntegrityResponse,
}

#[derive(Serialize)]
pub struct ChainIntegrityResponse {
    valid: bool,
    #[serde(rename = "brokenAt")]
    broken_at: Option<u64>,
    checked: u64,
}

pub async fn status(State(state): State<Arc<AppState>>) -> Json<StatusResponse> {
    let store = state.store.read().await;
    let verification = store.verify_chain();

    Json(StatusResponse {
        ok: true,
        enabled: true,
        total_events: store.total_events(),
        sequence: store.sequence(),
        chain_validation: true,
        chain_integrity: ChainIntegrityResponse {
            valid: verification.valid,
            broken_at: verification.broken_at,
            checked: verification.checked,
        },
    })
}

// ---------------------------------------------------------------------------
// POST /record
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct RecordRequest {
    pub category: String,
    pub action: String,
    #[serde(default = "default_data")]
    pub data: serde_json::Value,
    #[serde(default = "default_actor")]
    pub actor: String,
}

fn default_data() -> serde_json::Value {
    serde_json::Value::Object(serde_json::Map::new())
}

fn default_actor() -> String {
    "system".to_string()
}

#[derive(Serialize)]
pub struct RecordResponse {
    ok: bool,
    event: crate::event::AuditEvent,
}

pub async fn record(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RecordRequest>,
) -> (StatusCode, Json<RecordResponse>) {
    let mut store = state.store.write().await;
    let event = store.record(body.category, body.action, body.data, body.actor);

    (
        StatusCode::CREATED,
        Json(RecordResponse { ok: true, event }),
    )
}

// ---------------------------------------------------------------------------
// GET /query
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct QueryParams {
    pub category: Option<String>,
    pub action: Option<String>,
    #[serde(rename = "taskId")]
    pub task_id: Option<String>,
    pub since: Option<u64>,
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct QueryResponse {
    ok: bool,
    events: Vec<crate::event::AuditEvent>,
}

pub async fn query(
    State(state): State<Arc<AppState>>,
    Query(params): Query<QueryParams>,
) -> Json<QueryResponse> {
    let store = state.store.read().await;
    let limit = params.limit.unwrap_or(50);

    let events = store.query(
        params.category.as_deref(),
        params.action.as_deref(),
        params.task_id.as_deref(),
        params.since,
        limit,
    );

    Json(QueryResponse { ok: true, events })
}

// ---------------------------------------------------------------------------
// POST /verify-chain
// ---------------------------------------------------------------------------

#[derive(Serialize)]
pub struct VerifyChainResponse {
    ok: bool,
    valid: bool,
    #[serde(rename = "brokenAt")]
    broken_at: Option<u64>,
    checked: u64,
}

pub async fn verify_chain(State(state): State<Arc<AppState>>) -> Json<VerifyChainResponse> {
    let store = state.store.read().await;
    let verification = store.verify_chain();

    Json(VerifyChainResponse {
        ok: true,
        valid: verification.valid,
        broken_at: verification.broken_at,
        checked: verification.checked,
    })
}

// ---------------------------------------------------------------------------
// POST /replay
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
pub struct ReplayRequest {
    #[serde(rename = "taskId")]
    pub task_id: String,
}

#[derive(Serialize)]
pub struct ReplayResponse {
    ok: bool,
    events: Vec<crate::event::AuditEvent>,
}

pub async fn replay(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ReplayRequest>,
) -> Json<ReplayResponse> {
    let store = state.store.read().await;
    let events = store.replay_task(&body.task_id);

    Json(ReplayResponse { ok: true, events })
}
