#!/usr/bin/env bash
# ============================================================================
# OpenClaw Testing Platform — Start Script
# ============================================================================
# Ensures all services are running:
#   1. Docker Compose (RuVector DB + pgAdmin UI + RuVector Server)
#   2. OpenClaw workspace directories
#   3. Next.js dashboard (pnpm dev)
#
# Usage:
#   ./start.sh              # Start everything
#   ./start.sh --docker     # Start only Docker services
#   ./start.sh --app        # Start only the Next.js app
#   ./start.sh --stop       # Stop all services
#   ./start.sh --status     # Show status of all services
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ── Helpers ──────────────────────────────────────────────────────────────────

log()   { echo -e "${BLUE}[openclaw]${NC} $*"; }
ok()    { echo -e "${GREEN}[  ok  ]${NC} $*"; }
warn()  { echo -e "${YELLOW}[ warn ]${NC} $*"; }
err()   { echo -e "${RED}[error ]${NC} $*"; }
header() { echo -e "\n${CYAN}━━━ $* ━━━${NC}\n"; }

check_command() {
  if ! command -v "$1" &>/dev/null; then
    err "$1 is not installed. Please install it first."
    return 1
  fi
}

wait_for_healthy() {
  local container="$1"
  local max_wait="${2:-60}"
  local elapsed=0

  while [ $elapsed -lt $max_wait ]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "not_found")
    if [ "$status" = "healthy" ]; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# ── Environment ──────────────────────────────────────────────────────────────

load_env() {
  if [ -f .env.local ]; then
    log "Loading .env.local"
    set -a
    # shellcheck disable=SC1091
    source .env.local
    set +a
  elif [ -f .env ]; then
    log "Loading .env"
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  else
    warn "No .env.local or .env found — using defaults (copy .env.example to .env.local)"
  fi
}

# ── Docker Services ──────────────────────────────────────────────────────────

start_docker() {
  header "Docker Services"

  check_command docker || return 1
  check_command docker-compose 2>/dev/null || check_command "docker compose" 2>/dev/null || {
    # Try docker compose (v2 plugin)
    if docker compose version &>/dev/null; then
      COMPOSE_CMD="docker compose"
    else
      err "docker-compose is not installed."
      return 1
    fi
  }

  # Determine compose command
  if command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    COMPOSE_CMD="docker compose"
  fi

  log "Starting Docker Compose services..."
  $COMPOSE_CMD up -d

  # Wait for RuVector DB to be healthy
  log "Waiting for RuVector DB to be healthy..."
  if wait_for_healthy "openclaw-ruvector-db" 60; then
    ok "RuVector DB is healthy"
  else
    warn "RuVector DB health check timed out (may still be starting)"
  fi

  # Check RuVector server
  log "Waiting for RuVector Server..."
  if wait_for_healthy "openclaw-ruvector-server" 30; then
    ok "RuVector Server is healthy"
  else
    warn "RuVector Server health check timed out (may still be starting)"
  fi

  ok "pgAdmin UI available at http://localhost:${PGADMIN_PORT:-5050}"
  ok "RuVector DB available at localhost:${RUVECTOR_DB_PORT:-5433}"
  ok "RuVector Server available at http://localhost:${RUVECTOR_SERVER_PORT:-8080}"
}

stop_docker() {
  header "Stopping Docker Services"

  if command -v docker-compose &>/dev/null; then
    COMPOSE_CMD="docker-compose"
  else
    COMPOSE_CMD="docker compose"
  fi

  $COMPOSE_CMD down
  ok "Docker services stopped"
}

# ── OpenClaw Workspace ───────────────────────────────────────────────────────

ensure_workspace() {
  header "OpenClaw Workspace"

  local workspace="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace/qa-dashboard}"

  # Create workspace directories if they don't exist
  mkdir -p "$workspace/results"
  mkdir -p "$workspace/reports-md"

  ok "Workspace ready at $workspace"

  # Verify symlinks (non-fatal if they fail)
  if [ -L "$SCRIPT_DIR/results" ]; then
    ok "results symlink exists"
  else
    warn "results symlink missing — create with: ln -s $workspace/results $SCRIPT_DIR/results"
  fi

  if [ -L "$SCRIPT_DIR/reports-md" ]; then
    ok "reports-md symlink exists"
  else
    warn "reports-md symlink missing — create with: ln -s $workspace/reports-md $SCRIPT_DIR/reports-md"
  fi
}

# ── Node.js / pnpm ──────────────────────────────────────────────────────────

ensure_dependencies() {
  header "Dependencies"

  check_command node || return 1
  check_command pnpm || {
    warn "pnpm not found. Attempting install via corepack..."
    corepack enable && corepack prepare pnpm@latest --activate || {
      err "Failed to install pnpm. Install manually: npm install -g pnpm"
      return 1
    }
  }

  if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
    log "Installing dependencies..."
    pnpm install
    ok "Dependencies installed"
  else
    ok "Dependencies up to date"
  fi
}

# ── Next.js App ──────────────────────────────────────────────────────────────

start_app() {
  header "Next.js Dashboard"

  ensure_dependencies || return 1

  # Check if already running
  if lsof -i :3000 -sTCP:LISTEN &>/dev/null 2>&1; then
    warn "Port 3000 is already in use"
    log "The dashboard may already be running. Check with: lsof -i :3000"
    return 0
  fi

  log "Starting Next.js dev server..."
  log "Dashboard will be available at http://localhost:3000"
  echo ""

  # Run in foreground so user can see output and Ctrl+C to stop
  exec pnpm dev
}

start_app_background() {
  header "Next.js Dashboard (Background)"

  ensure_dependencies || return 1

  if lsof -i :3000 -sTCP:LISTEN &>/dev/null 2>&1; then
    warn "Port 3000 is already in use — dashboard may already be running"
    return 0
  fi

  log "Starting Next.js dev server in background..."
  nohup pnpm dev > /tmp/openclaw-dashboard.log 2>&1 &
  local pid=$!
  echo "$pid" > /tmp/openclaw-dashboard.pid

  # Wait a few seconds for startup
  sleep 3

  if kill -0 "$pid" 2>/dev/null; then
    ok "Dashboard running (PID: $pid)"
    ok "Logs: tail -f /tmp/openclaw-dashboard.log"
    ok "URL:  http://localhost:3000"
  else
    err "Dashboard failed to start. Check /tmp/openclaw-dashboard.log"
    return 1
  fi
}

# ── Status ───────────────────────────────────────────────────────────────────

show_status() {
  header "Service Status"

  # Docker services
  echo -e "${CYAN}Docker Services:${NC}"
  if command -v docker &>/dev/null; then
    for container in openclaw-ruvector-db openclaw-ruvector-server openclaw-ruvector-ui; do
      local status
      status=$(docker inspect --format='{{.State.Status}} ({{.State.Health.Status}})' "$container" 2>/dev/null || echo "not running")
      if [[ "$status" == *"running"* ]]; then
        ok "$container: $status"
      else
        warn "$container: $status"
      fi
    done
  else
    warn "Docker not available"
  fi

  echo ""

  # Next.js app
  echo -e "${CYAN}Next.js Dashboard:${NC}"
  if lsof -i :3000 -sTCP:LISTEN &>/dev/null 2>&1; then
    ok "Running on http://localhost:3000"
  else
    warn "Not running"
  fi

  echo ""

  # Workspace
  echo -e "${CYAN}Workspace:${NC}"
  local workspace="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace/qa-dashboard}"
  if [ -d "$workspace" ]; then
    ok "Workspace: $workspace"
    local result_count
    result_count=$(find "$workspace/results" -name "*.json" 2>/dev/null | wc -l || echo "0")
    log "  Results: $result_count files"
  else
    warn "Workspace not found at $workspace"
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────

main() {
  echo -e "${CYAN}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║     OpenClaw Testing Platform                ║"
  echo "  ║     Multi-Agent QA Dashboard                 ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"

  load_env

  case "${1:-}" in
    --docker)
      start_docker
      ;;
    --app)
      ensure_workspace
      start_app
      ;;
    --stop)
      stop_docker
      # Stop background app if running
      if [ -f /tmp/openclaw-dashboard.pid ]; then
        local pid
        pid=$(cat /tmp/openclaw-dashboard.pid)
        if kill -0 "$pid" 2>/dev/null; then
          kill "$pid"
          ok "Dashboard stopped (PID: $pid)"
        fi
        rm -f /tmp/openclaw-dashboard.pid
      fi
      ;;
    --status)
      show_status
      ;;
    --help|-h)
      echo "Usage: ./start.sh [option]"
      echo ""
      echo "Options:"
      echo "  (none)       Start everything (Docker + workspace + app)"
      echo "  --docker     Start only Docker services (RuVector DB, UI, Server)"
      echo "  --app        Start only the Next.js dashboard"
      echo "  --stop       Stop all services"
      echo "  --status     Show status of all services"
      echo "  --help       Show this help message"
      ;;
    *)
      start_docker
      ensure_workspace
      echo ""
      ok "All infrastructure services are running."
      echo ""
      log "Starting the dashboard (Ctrl+C to stop)..."
      echo ""
      start_app
      ;;
  esac
}

main "$@"
