mod config;
mod event;
mod hash_chain;
mod persistence;
mod routes;
mod store;

use std::sync::Arc;
use std::time::Instant;

use axum::Router;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;
use tracing_subscriber::EnvFilter;

use crate::config::Config;
use crate::routes::AppState;
use crate::store::AuditStore;

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config = Config::from_env();
    let port = config.port;
    let flush_interval_secs = config.flush_interval_secs;

    let store = AuditStore::new(&config);

    let state = Arc::new(AppState {
        store: RwLock::new(store),
        start_time: Instant::now(),
    });

    // Background flush task
    if flush_interval_secs > 0 {
        let flush_state = Arc::clone(&state);
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(std::time::Duration::from_secs(flush_interval_secs));
            loop {
                interval.tick().await;
                let mut store = flush_state.store.write().await;
                store.flush_to_disk();
            }
        });
    }

    let app = Router::new()
        .route("/health", axum::routing::get(routes::health))
        .route("/status", axum::routing::get(routes::status))
        .route("/record", axum::routing::post(routes::record))
        .route("/query", axum::routing::get(routes::query))
        .route("/verify-chain", axum::routing::post(routes::verify_chain))
        .route("/replay", axum::routing::post(routes::replay))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    tracing::info!("Audit service listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
