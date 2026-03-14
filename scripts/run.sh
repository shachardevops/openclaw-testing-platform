#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  run.sh — Full OpenClaw + RuVector Ecosystem Bootstrap                     ║
# ║                                                                            ║
# ║  Checks all dependencies, starts all services, indexes data,               ║
# ║  verifies OpenClaw sessions, and optionally launches the                   ║
# ║  RuVector Edge-Net dashboard frontend.                                     ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    pnpm run                   # Full bootstrap (DB + Edge-Net + index)     ║
# ║    pnpm run --status          # Just check status of everything            ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

BOLD='\033[1m'
DIM='\033[2m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

pass()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn()   { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()   { echo -e "  ${RED}✗${NC} $1"; }
info()   { echo -e "  ${BLUE}→${NC} $1"; }
header() { echo -e "\n${BOLD}${CYAN}[$1]${NC} ${BOLD}$2${NC}"; }

ERRORS=0
WARNINGS=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUVECTOR_DIR="${RUVECTOR_DIR:-$PROJECT_DIR/RuVector}"
STATUS_ONLY=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --status) STATUS_ONLY=true ;;
    --help|-h)
      echo "Usage: run.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --status   Check status of all services without starting anything"
      echo "  --help     Show this help"
      echo ""
      echo "Environment:"
      echo "  RUVECTOR_DIR           Path to RuVector clone (default: ./RuVector)"
      echo "  OPENCLAW_GATEWAY_URL   Gateway URL (default: http://localhost:3578)"
      exit 0
      ;;
  esac
done

echo -e "${BOLD}${CYAN}"
echo "  ┌─────────────────────────────────────────────┐"
echo "  │  OpenClaw + RuVector Ecosystem Bootstrap     │"
echo "  └─────────────────────────────────────────────┘"
echo -e "${NC}"

# ═══════════════════════════════════════════════════════════════════════════════
# 1. PREREQUISITES
# ═══════════════════════════════════════════════════════════════════════════════

header "1/8" "Checking prerequisites"

# Node.js
if command -v node &>/dev/null; then
  NODE_VERSION=$(node -v | sed 's/v//')
  NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)
  if [ "$NODE_MAJOR" -ge 18 ]; then
    pass "Node.js $NODE_VERSION"
  else
    fail "Node.js $NODE_VERSION (need 18+)"
    ERRORS=$((ERRORS + 1))
  fi
else
  fail "Node.js not found"
  ERRORS=$((ERRORS + 1))
fi

# npm (needed for Edge-Net dashboard)
if command -v npm &>/dev/null; then
  pass "npm $(npm -v)"
else
  warn "npm not found — Edge-Net dashboard install will fail"
  WARNINGS=$((WARNINGS + 1))
fi

# pnpm
if command -v pnpm &>/dev/null; then
  pass "pnpm $(pnpm -v)"
else
  fail "pnpm not found — install with: npm install -g pnpm"
  ERRORS=$((ERRORS + 1))
fi

# Git
if command -v git &>/dev/null; then
  pass "git $(git --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
else
  fail "git not found"
  ERRORS=$((ERRORS + 1))
fi

# Docker
DOCKER_OK=false
if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    pass "Docker $(docker --version | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')"
    DOCKER_OK=true
  else
    fail "Docker installed but daemon not running"
    ERRORS=$((ERRORS + 1))
  fi
else
  fail "Docker not found — install from https://docker.com"
  ERRORS=$((ERRORS + 1))
fi

# Docker Compose
if $DOCKER_OK; then
  if docker compose version &>/dev/null 2>&1; then
    pass "Docker Compose $(docker compose version --short 2>/dev/null || echo 'available')"
  else
    fail "Docker Compose not available"
    ERRORS=$((ERRORS + 1))
  fi
fi

# OpenClaw CLI
OPENCLAW_OK=false
if command -v openclaw &>/dev/null; then
  pass "OpenClaw CLI $(openclaw --version 2>/dev/null || echo '(version unknown)')"
  OPENCLAW_OK=true
else
  warn "OpenClaw CLI not found — agent spawning will not work"
  WARNINGS=$((WARNINGS + 1))
fi

# curl
if command -v curl &>/dev/null; then
  pass "curl available"
else
  warn "curl not found — health checks will be skipped"
  WARNINGS=$((WARNINGS + 1))
fi

if $STATUS_ONLY; then
  echo ""
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 2. INSTALL DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════════════

header "2/8" "Installing dashboard dependencies"

if $STATUS_ONLY; then
  if [ -d "$PROJECT_DIR/node_modules" ]; then
    pass "node_modules present"
  else
    fail "node_modules missing — run: pnpm install"
    ERRORS=$((ERRORS + 1))
  fi
else
  cd "$PROJECT_DIR"
  if pnpm install --frozen-lockfile 2>/dev/null || pnpm install 2>/dev/null; then
    pass "Node modules installed"
  else
    fail "pnpm install failed"
    ERRORS=$((ERRORS + 1))
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 3. DOCKER SERVICES (RuVector DB + Edge-Net Dashboard)
# ═══════════════════════════════════════════════════════════════════════════════

header "3/8" "Docker services (RuVector DB + Edge-Net)"

if ! $DOCKER_OK; then
  fail "Docker not available — skipping all Docker services"
  ERRORS=$((ERRORS + 1))
else
  cd "$PROJECT_DIR"

  # Check if RuVector source is cloned (needed for Edge-Net build)
  if [ ! -d "$RUVECTOR_DIR" ]; then
    if $STATUS_ONLY; then
      warn "RuVector not cloned at $RUVECTOR_DIR — Edge-Net container won't build"
      info "Clone with: git clone https://github.com/ruvnet/RuVector.git"
      WARNINGS=$((WARNINGS + 1))
    else
      info "Cloning RuVector (needed for Edge-Net dashboard)..."
      if git clone https://github.com/ruvnet/RuVector.git "$RUVECTOR_DIR" 2>&1 | tail -1; then
        pass "RuVector cloned to $RUVECTOR_DIR"
      else
        warn "Failed to clone RuVector — Edge-Net container won't build"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  else
    pass "RuVector source: $RUVECTOR_DIR"
  fi

  if $STATUS_ONLY; then
    # ── Status-only checks ──
    for CNAME in ruvector ruvector-edge-net; do
      if docker ps --format '{{.Names}}' | grep -q "^${CNAME}$"; then
        STATUS=$(docker inspect --format='Up since {{.State.StartedAt}}' "$CNAME" 2>/dev/null | cut -c1-50)
        pass "$CNAME running — $STATUS"
      elif docker ps -a --format '{{.Names}}' | grep -q "^${CNAME}$"; then
        fail "$CNAME exists but stopped"
        ERRORS=$((ERRORS + 1))
      else
        fail "$CNAME not found"
        ERRORS=$((ERRORS + 1))
      fi
    done

    # Verify PostgreSQL
    if docker ps --format '{{.Names}}' | grep -q '^ruvector$'; then
      if docker exec ruvector pg_isready -U ruvector -q 2>/dev/null; then
        pass "PostgreSQL accepting connections"
      else
        fail "PostgreSQL not ready"
        ERRORS=$((ERRORS + 1))
      fi
      RV_VERSION=$(docker exec ruvector psql -U ruvector -d ruvector_test -t -c "SELECT ruvector_version();" 2>/dev/null | xargs)
      if [ -n "$RV_VERSION" ]; then
        pass "RuVector extension: $RV_VERSION"
      fi
    fi

  else
    # ── Start services via docker compose ──
    if [ ! -f "docker-compose.yml" ]; then
      fail "docker-compose.yml not found"
      ERRORS=$((ERRORS + 1))
    else
      info "Running docker compose up -d..."
      COMPOSE_OUTPUT=$(docker compose up -d 2>&1) || true

      # Check RuVector DB
      if docker ps --format '{{.Names}}' | grep -q '^ruvector$'; then
        pass "RuVector DB container running"
        echo -n "  Waiting for PostgreSQL..."
        for i in $(seq 1 20); do
          if docker exec ruvector pg_isready -U ruvector -q 2>/dev/null; then
            echo ""
            pass "PostgreSQL ready"
            break
          fi
          echo -n "."
          sleep 1
          if [ "$i" -eq 20 ]; then
            echo ""
            fail "PostgreSQL not ready after 20s"
            ERRORS=$((ERRORS + 1))
          fi
        done

        # Verify extension
        RV_VERSION=$(docker exec ruvector psql -U ruvector -d ruvector_test -t -c "SELECT ruvector_version();" 2>/dev/null | xargs)
        if [ -n "$RV_VERSION" ]; then
          pass "RuVector extension: $RV_VERSION"
        fi
      else
        warn "RuVector DB container did not start"
        if echo "$COMPOSE_OUTPUT" | grep -qi "pull access denied\|repository does not exist"; then
          info "Image not available — build from source:"
          info "  cd RuVector/crates/ruvector-postgres/docker && docker compose up -d postgres"
        else
          echo "$COMPOSE_OUTPUT" | tail -3
        fi
        WARNINGS=$((WARNINGS + 1))
      fi

      # Check Edge-Net Dashboard
      if docker ps --format '{{.Names}}' | grep -q '^ruvector-edge-net$'; then
        pass "Edge-Net dashboard container running"
        pass "Edge-Net UI: http://localhost:5173"
      else
        warn "Edge-Net container did not start"
        if [ ! -d "$RUVECTOR_DIR/examples/edge-net/dashboard/Dockerfile" ] 2>/dev/null; then
          info "Check that $RUVECTOR_DIR/examples/edge-net/dashboard exists with a Dockerfile"
        fi
        info "You can start it manually: cd RuVector/examples/edge-net/dashboard && npm run dev"
        WARNINGS=$((WARNINGS + 1))
      fi
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 4. WORKSPACE & SYMLINKS
# ═══════════════════════════════════════════════════════════════════════════════

header "4/8" "Workspace and symlinks"

cd "$PROJECT_DIR"
WORKSPACE_DIR="$HOME/.openclaw/workspace/qa-dashboard"

# Check/create workspace
if [ -d "$WORKSPACE_DIR" ]; then
  pass "Workspace exists: $WORKSPACE_DIR"
else
  if $STATUS_ONLY; then
    fail "Workspace missing: $WORKSPACE_DIR"
    ERRORS=$((ERRORS + 1))
  else
    mkdir -p "$WORKSPACE_DIR/results" "$WORKSPACE_DIR/reports-md"
    pass "Workspace created: $WORKSPACE_DIR"
  fi
fi

# Check/create symlinks
for LINK in results reports-md; do
  if [ -L "$LINK" ]; then
    TARGET=$(readlink "$LINK")
    if [ -d "$TARGET" ] 2>/dev/null || [ -d "$LINK" ]; then
      pass "Symlink: $LINK → $TARGET"
    else
      warn "Symlink $LINK → $TARGET (target missing)"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    if $STATUS_ONLY; then
      fail "Symlink missing: $LINK"
      ERRORS=$((ERRORS + 1))
    else
      ln -sf "$WORKSPACE_DIR/$LINK" "$LINK"
      pass "Symlink created: $LINK → $WORKSPACE_DIR/$LINK"
    fi
  fi
done

# pipeline-config.json
if [ -L "pipeline-config.json" ] || [ -f "pipeline-config.json" ]; then
  pass "pipeline-config.json present"
else
  warn "pipeline-config.json missing — pipeline execution may fail"
  WARNINGS=$((WARNINGS + 1))
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 5. INDEX MEMORY INTO RUVECTOR
# ═══════════════════════════════════════════════════════════════════════════════

header "5/8" "RuVector memory indexing"

cd "$PROJECT_DIR"
MEMORY_DIR="config/ordertu-qa/memory"
RUVECTOR_META_DIR="$MEMORY_DIR/ruvector"

if $STATUS_ONLY; then
  if [ -d "$RUVECTOR_META_DIR" ]; then
    META_COUNT=$(ls "$RUVECTOR_META_DIR"/*.meta.json 2>/dev/null | wc -l | xargs)
    if [ "$META_COUNT" -gt 0 ]; then
      pass "Vector index present ($META_COUNT collections)"
      for f in "$RUVECTOR_META_DIR"/*.meta.json; do
        NAME=$(basename "$f" .meta.json)
        COUNT=$(grep -c '"_indexedAt"' "$f" 2>/dev/null || echo "0")
        info "$NAME: $COUNT entries"
      done
    else
      warn "Vector index directory exists but no .meta.json files"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    fail "Vector index not found — run: pnpm index-memory"
    ERRORS=$((ERRORS + 1))
  fi
else
  if [ -d "$MEMORY_DIR" ]; then
    info "Indexing memory files with ONNX embeddings..."
    if pnpm index-memory 2>&1 | tail -5; then
      pass "Memory indexed"
    else
      warn "Indexing had issues — search may return incomplete results"
      WARNINGS=$((WARNINGS + 1))
    fi
  else
    warn "No memory directory at $MEMORY_DIR — skipping indexing"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 6. OPENCLAW SERVICES
# ═══════════════════════════════════════════════════════════════════════════════

header "6/8" "OpenClaw services"

# Gateway health
GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://localhost:3578}"
if command -v curl &>/dev/null; then
  if curl -s --max-time 3 "$GATEWAY_URL/health" >/dev/null 2>&1; then
    pass "Gateway reachable: $GATEWAY_URL"
  else
    warn "Gateway not reachable: $GATEWAY_URL"
    info "Start with: openclaw gateway start"
    WARNINGS=$((WARNINGS + 1))
  fi
else
  warn "curl not available — skipping gateway check"
fi

# Controller session
if [ -f "pipeline-config.json" ]; then
  CONTROLLER_ID=$(grep -o '"controllerSessionId"[[:space:]]*:[[:space:]]*"[^"]*"' pipeline-config.json 2>/dev/null | head -1 | grep -o '"[^"]*"$' | tr -d '"')
  if [ -n "$CONTROLLER_ID" ]; then
    pass "Controller session ID: ${CONTROLLER_ID:0:20}..."
  else
    warn "No controllerSessionId in pipeline-config.json"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# Active OpenClaw sessions
if $OPENCLAW_OK; then
  SESSION_COUNT=$(openclaw session list 2>/dev/null | grep -c "active" || echo "0")
  if [ "$SESSION_COUNT" -gt 0 ]; then
    pass "Active OpenClaw sessions: $SESSION_COUNT"
  else
    info "No active OpenClaw sessions"
  fi

  # Check if openclaw process is running
  if pgrep -f "openclaw" >/dev/null 2>&1; then
    OPENCLAW_PIDS=$(pgrep -f "openclaw" | wc -l | xargs)
    pass "OpenClaw processes running: $OPENCLAW_PIDS"
  else
    info "No OpenClaw processes currently running"
  fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 7. DOCKER CONTAINER HEALTH
# ═══════════════════════════════════════════════════════════════════════════════

header "7/8" "Docker containers"

if $DOCKER_OK; then
  # List all project-related containers
  CONTAINERS=$(docker ps -a --format '{{.Names}}|{{.Status}}|{{.Ports}}' 2>/dev/null | grep -iE "ruvector|openclaw|qa-dashboard" || true)
  if [ -n "$CONTAINERS" ]; then
    while IFS='|' read -r NAME STATUS PORTS; do
      if echo "$STATUS" | grep -qi "up"; then
        pass "$NAME — $STATUS ${PORTS:+($PORTS)}"
      else
        warn "$NAME — $STATUS"
        WARNINGS=$((WARNINGS + 1))
      fi
    done <<< "$CONTAINERS"
  else
    info "No project-related containers found"
  fi

  # Check for port conflicts
  for PORT in 3000 5432 5173; do
    USED_BY=$(docker ps --format '{{.Names}}:{{.Ports}}' 2>/dev/null | grep ":$PORT->" | head -1)
    if [ -n "$USED_BY" ]; then
      info "Port $PORT in use by: $USED_BY"
    fi
  done
else
  warn "Docker not available — skipping container checks"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# 8. SERVICE SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

header "8/8" "Service endpoints"

# Check all expected endpoints
check_endpoint() {
  local NAME=$1 URL=$2
  if command -v curl &>/dev/null && curl -s --max-time 2 "$URL" >/dev/null 2>&1; then
    pass "$NAME: $URL"
  else
    info "$NAME: $URL (not reachable)"
  fi
}

check_endpoint "RuVector DB"        "localhost:5432"
check_endpoint "Edge-Net Dashboard" "http://localhost:5173"
check_endpoint "QA Dashboard"       "http://localhost:3000"

# ═══════════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ $ERRORS -gt 0 ]; then
  echo -e "${RED}${BOLD}  $ERRORS error(s), $WARNINGS warning(s)${NC}"
  echo -e "  Fix errors above and re-run: ${BOLD}pnpm run${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 1
elif [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}${BOLD}  Ready with $WARNINGS warning(s)${NC}"
else
  echo -e "${GREEN}${BOLD}  All systems go${NC}"
fi

echo ""
echo -e "  ${BOLD}Services:${NC}"
docker ps --format '{{.Names}}' 2>/dev/null | grep -iE "ruvector|openclaw" | while read -r name; do
  echo -e "    ${GREEN}●${NC} $name"
done || true
echo ""
echo -e "  ${BOLD}Quick commands:${NC}"
echo "    pnpm dev                  Start QA dashboard         → http://localhost:3000"
echo "    docker compose up -d      Start RuVector + Edge-Net  → http://localhost:5173"
echo "    docker compose ps         Check container status"
echo "    pnpm run --status         Health check all services"
echo "    pnpm index-memory         Re-index after memory changes"
echo "    pnpm build && pnpm start  Production mode"
echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
