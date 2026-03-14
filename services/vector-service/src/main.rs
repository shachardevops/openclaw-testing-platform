mod collection;
mod config;
mod embedding;
mod routes;
mod similarity;

use axum::{
    routing::{get, post},
    Router,
};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::RwLock;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

use crate::collection::VectorCollection;
use crate::config::Config;
use crate::routes::{
    health_handler, hybrid_search_handler, insert_handler, search_all_handler, search_handler,
    status_handler, AppState, SharedState,
};

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();

    tracing::info!(
        "Starting vector-service on port {} with {} dimensions",
        config.port,
        config.dimensions
    );

    // Initialize collections
    let mut collections = HashMap::new();
    collections.insert(
        "learnings".to_string(),
        VectorCollection::new("learnings", config.dimensions, config.max_learnings),
    );
    collections.insert(
        "decisions".to_string(),
        VectorCollection::new("decisions", config.dimensions, config.max_decisions),
    );
    collections.insert(
        "patterns".to_string(),
        VectorCollection::new("patterns", config.dimensions, config.max_patterns),
    );

    let state: SharedState = Arc::new(RwLock::new(AppState {
        collections,
        start_time: Instant::now(),
        dimensions: config.dimensions,
    }));

    // CORS: allow all origins (dev mode)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/health", get(health_handler))
        .route("/status", get(status_handler))
        .route("/insert", post(insert_handler))
        .route("/search", post(search_handler))
        .route("/hybrid-search", post(hybrid_search_handler))
        .route("/search-all", post(search_all_handler))
        .layer(cors)
        .with_state(state);

    let addr = format!("0.0.0.0:{}", config.port);
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("Failed to bind address");

    axum::serve(listener, app)
        .await
        .expect("Server error");
}
