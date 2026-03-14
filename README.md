# OpenClaw Testing Platform

Multi-agent QA dashboard that orchestrates [OpenClaw](https://github.com/openclaw) testing sessions. Built with Next.js 15 (App Router), React 19, and Tailwind CSS 4.

## What It Does

The platform spawns and manages AI agents that run QA test stories against a target application (OrderTu). It provides:

- **Task execution** — dispatch test stories to AI agents with configurable models and skills
- **Pipeline orchestration** — run multiple tasks in sequence with quality gates between stages
- **Session management** — automatic escalation (nudge → model swap → kill) for stuck agents
- **Live monitoring** — real-time log streaming, result polling, and drift detection
- **Vector memory** — semantic search over past learnings, decisions, and patterns via RuVector
- **Self-healing** — circuit breakers, retry with backoff, and automated recovery workflows

## Architecture

```
UI (React 19)
  → API Routes (Next.js App Router, Node.js runtime)
  → lib/openclaw.js (fire-and-forget child_process.spawn)
  → OpenClaw CLI writes results to ~/.openclaw/workspace/
  → Dashboard polls results every 2s → UI updates

RuVector DB (PostgreSQL + vector extensions)
  → Stores agent learnings, orchestrator decisions, QA patterns
  → HNSW + GNN indexing for semantic search
  → pgAdmin UI for database management
  → Grafana dashboards for monitoring & visualization
```

## Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Node.js | 18+ | Yes |
| pnpm | 9+ | Yes |
| Docker | 24+ | For vector DB |
| Docker Compose | 2.0+ | For vector DB |
| OpenClaw CLI | latest | For agent execution |

## Quick Start

### 1. Clone and install

```bash
git clone <repo-url> openclaw-testing-platform
cd openclaw-testing-platform
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_SESSION_ID` | (from pipeline-config.json) | Controller session ID |
| `OPENCLAW_PROJECT` | `ordertu-qa` | Active project ID |
| `OPENCLAW_GATEWAY_PORT` | `18789` | OpenClaw gateway port |
| `RUVECTOR_DB_PASSWORD` | `ruvector_secret` | PostgreSQL password |
| `RUVECTOR_DB_PORT` | `5433` | Database port |
| `PGADMIN_PORT` | `5050` | pgAdmin UI port |
| `GRAFANA_PORT` | `3001` | Grafana dashboard port |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

### 3. Start everything

```bash
./start.sh
```

This will:
1. Start Docker Compose (RuVector DB + pgAdmin UI + RuVector Server + Grafana)
2. Verify the RuVector extension is installed and check for known issues
3. Create workspace directories (`~/.openclaw/workspace/qa-dashboard/`)
4. Start the Next.js dev server on `http://localhost:3000`

### Selective start

```bash
./start.sh --docker    # Start only Docker services
./start.sh --app       # Start only the Next.js dashboard
./start.sh --status    # Show status of all services
./start.sh --stop      # Stop everything
```

## Services

Once running, these services are available:

| Service | URL | Description |
|---------|-----|-------------|
| QA Dashboard | http://localhost:3000 | Main application UI |
| Grafana | http://localhost:3001 | Vector collection monitoring & analytics |
| pgAdmin | http://localhost:5050 | Database management UI |
| RuVector Server | http://localhost:8080 | Vector search API |
| RuVector DB | localhost:5433 | PostgreSQL with vector extensions |

### Grafana Dashboards

- **URL:** http://localhost:3001
- **Login:** `admin` / `admin` (or `GRAFANA_USER` / `GRAFANA_PASSWORD`)

Pre-provisioned dashboard **"RuVector — Vector Memory Overview"** includes:
- Extension health status and version
- Collection row counts with HNSW index status
- Time-series graphs for learnings, decisions, and patterns insertion rates
- Recent entries tables
- Index size monitoring
- Distribution breakdowns by project and pattern type

### pgAdmin Login

- **Email:** `admin@openclaw.local` (or `PGADMIN_EMAIL`)
- **Password:** `admin` (or `PGADMIN_PASSWORD`)

The RuVector DB server is pre-configured in pgAdmin. On first login, enter the database password (`ruvector_secret` or your `RUVECTOR_DB_PASSWORD`).

## Development Commands

```bash
pnpm dev          # Start dev server (localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

## Project Structure

```
openclaw-testing-platform/
├── app/                    # Next.js App Router
│   └── api/                # 30+ API routes (all Node.js runtime)
├── components/             # React UI components
├── config/                 # Per-project configuration
│   └── ordertu-qa/         # OrderTu project config
│       ├── project.json    # Main project config
│       ├── tasks.json      # Task definitions
│       ├── models.json     # Available AI models
│       ├── skills.json     # Agent skills
│       ├── pipelines.json  # Pipeline definitions
│       └── memory/         # Agent learnings, decision memory, vectors
├── context/                # React Context (state management)
├── docker/                 # Docker initialization files
│   ├── init-db.sql         # RuVector schema setup (with edge-case guards)
│   ├── pgadmin-servers.json
│   └── grafana/            # Grafana provisioning
│       ├── provisioning/   # Datasource + dashboard config
│       └── dashboards/     # Pre-built dashboard JSON
├── hooks/                  # Custom React hooks
├── lib/                    # Core logic modules
│   ├── openclaw.js         # CLI bridge (spawn/exec/list)
│   ├── vector-memory.js    # RuVector integration
│   ├── orchestrator-engine.js  # Deterministic decision engine
│   ├── drift-detector.js   # Anti-drift monitoring
│   ├── self-healing.js     # Circuit breaker + retry
│   ├── security-validator.js   # Input validation
│   └── ...                 # 15+ modules
├── stories/                # QA test story templates
├── docker-compose.yml      # RuVector DB + UI + Server
├── start.sh                # One-command startup script
└── .env.example            # Environment variable template
```

## RuVector Integration

The platform uses [RuVector](https://github.com/ruvnet/ruvector) for semantic search over QA data. Three collections are maintained:

| Collection | Purpose | Max Vectors |
|------------|---------|-------------|
| `learnings` | Bug patterns, test outcomes, agent insights | 5,000 |
| `decisions` | Orchestrator decision history (Layer 3 cache) | 2,000 |
| `patterns` | Recurring QA patterns, test strategies | 3,000 |

### How it works

1. **In-process fallback** — `lib/vector-memory.js` uses TF-IDF hashing + cosine similarity when RuVector is not installed
2. **Native RuVector** — when `ruvector` npm package is installed (`pnpm add ruvector`), switches to HNSW indexing
3. **PostgreSQL** — the Docker Compose setup provides a full RuVector PostgreSQL instance with `VECTOR(384)` columns and HNSW indexes

### Database schema

The `docker/init-db.sql` creates three tables (`learnings`, `decisions`, `patterns`) with:
- `VECTOR(384)` embedding columns with HNSW cosine indexes
- JSONB metadata for flexible querying
- A `search_similar()` helper function for cosine similarity search

### Known Issues & Edge-Case Handling

All known RuVector issues are handled defensively in `lib/vector-memory.js` and `docker/init-db.sql`. The platform remains fully functional even when issues are triggered — it falls back gracefully.

#### Open Issues (active bugs)

| Issue | Severity | Impact | Our Mitigation |
|-------|----------|--------|----------------|
| [#258](https://github.com/ruvnet/ruvector/issues/258) | Medium | `SonaEngine.forceLearn()` silently drops trajectories — self-learning never triggers | SonaEngine disabled in config (`enableLearning: false`). Never call `forceLearn()`. |
| [#257](https://github.com/ruvnet/ruvector/issues/257) | Medium | `SonaEngine.getStats()` returns Rust debug string, crashes `JSON.parse()` | `safeParseRuVectorStats()` wrapper handles both JSON and Rust debug format. |
| [#256](https://github.com/ruvnet/ruvector/issues/256) | High | MCP server `workers_create` has command injection vulnerability | We never use MCP server. Use Node.js NAPI-RS API directly. |
| [#254](https://github.com/ruvnet/ruvector/issues/254) | Low | `@ruvector/mincut-wasm` and `@ruvector/mincut-native` not published (404) | Not used by this project. |
| [#165](https://github.com/ruvnet/ruvector/issues/165) | Low | `@ruvector/rvdna` native binaries not published | Not used by this project. |

#### Closed Issues (fixed but guarded against)

| Issue | What Happened | Our Guard |
|-------|---------------|-----------|
| [#175](https://github.com/ruvnet/ruvector/issues/175) | Docker image missing `ruvector--2.0.0.sql` — extension install fails | `init-db.sql` wraps `CREATE EXTENSION` in exception handler. `start.sh` verifies extension post-startup. |
| [#171](https://github.com/ruvnet/ruvector/issues/171) | HNSW returns only 1 result on small tables (<100 rows) due to hardcoded 128 dimensions | `vector-memory.js` supplements native results with in-memory brute-force when fewer than requested results return. Health check validates dimension round-trip on init. |
| [#164](https://github.com/ruvnet/ruvector/issues/164) | HNSW segfault (SIGSEGV) on tables >100K rows — hardcoded dimensions corrupt page layout | Native search wrapped in try/catch. On crash, falls back to in-memory brute-force. `start.sh` warns if version <2.0.2. |
| [#167](https://github.com/ruvnet/ruvector/issues/167) | `ruvector_list_agents()` and `ruvector_sparql_json()` crash PostgreSQL backend | We never call these functions. Only standard SQL queries used. |
| [#152](https://github.com/ruvnet/ruvector/issues/152) | HNSW index errors on `COUNT(*)` and `WHERE embedding IS NOT NULL` | `safe_count()` SQL function disables index scan before counting. Used by `collection_stats()` for monitoring. |
| [#251](https://github.com/ruvnet/ruvector/issues/251) | SIMD stubs in ruvector-cnn — performance-critical functions were no-ops | Not used directly. We use HNSW search only, not CNN features. |

#### Defensive patterns in vector-memory.js

- **Input sanitization** — text truncated to 10KB, null bytes stripped, empty strings return early
- **Health check on init** — insert + search round-trip validates dimensions work correctly
- **Native failure fallback** — every native call (insert, search, getStats) is wrapped in try/catch with automatic fallback to in-memory
- **Result supplementation** — when HNSW returns fewer results than `limit`, brute-force fills the gap
- **Cold start awareness** — GNN needs ~100+ similar queries before improving. Core HNSW search works immediately

#### Post-upgrade maintenance

After upgrading `ruvnet/ruvector-postgres` Docker image:

```sql
-- Rebuild all HNSW indexes to pick up dimension/page layout fixes
SELECT rebuild_all_indexes();

-- Verify collection health
SELECT * FROM collection_stats();

-- Check extension version
SELECT * FROM _ruvector_health ORDER BY check_time DESC LIMIT 1;
```

## Orchestrator Engine

The deterministic decision engine (`lib/orchestrator-engine.js`) handles session health:

| Layer | Approach | Description |
|-------|----------|-------------|
| 1 | Condition Tracker | Deduplicates events |
| 2 | Decision Tree | Known patterns: stale→nudge→swap→kill |
| 3 | AI + Decision Memory | Unknown patterns sent to AI, results cached |

**Autonomy levels:** 0 (manual) → 4 (adaptive). Default is 3.

Manage via the Orchestrator tab in the UI or the `/api/orchestrator` endpoint.

## API Routes

All API routes use `runtime = 'nodejs'` and return `{ ok, data/error }` JSON.

Key endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/run-agent-start` | POST | Dispatch a test task to an agent |
| `/api/run-agent-cancel` | POST | Cancel a running task |
| `/api/results` | GET | Poll task results |
| `/api/orchestrator` | GET/POST | Orchestrator status and actions |
| `/api/vector-search` | POST | Semantic search across collections |
| `/api/gateway/health` | GET | OpenClaw gateway health check |
| `/api/drift-detector` | GET/POST | Drift detection status |
| `/api/quality-gates` | POST | Quality gate evaluation |

## Workspace

Results and reports live outside the repo at `~/.openclaw/workspace/qa-dashboard/`:

```
~/.openclaw/workspace/qa-dashboard/
├── results/        # Task result JSON files
└── reports-md/     # Markdown test reports
```

Root-level symlinks (`results`, `reports-md`) point to these directories.

## Troubleshooting

### Docker services won't start

```bash
# Check logs
docker compose logs ruvector-db
docker compose logs ruvector-server

# Reset volumes (destroys data)
docker compose down -v
docker compose up -d
```

### Port conflicts

Change ports in `.env.local`:
```bash
RUVECTOR_DB_PORT=5434      # Default: 5433
PGADMIN_PORT=5051          # Default: 5050
RUVECTOR_SERVER_PORT=8081  # Default: 8080
GRAFANA_PORT=3002          # Default: 3001
```

### Dashboard won't start

```bash
# Check port 3000
lsof -i :3000

# Reinstall dependencies
rm -rf node_modules
pnpm install

# Check Node.js version
node --version  # Needs 18+
```

### RuVector DB connection issues

```bash
# Test connection
psql -h localhost -p 5433 -U ruvector -d openclaw_vectors

# Check extension
psql -h localhost -p 5433 -U ruvector -d openclaw_vectors -c "SELECT * FROM pg_extension WHERE extname = 'ruvector';"

# Check from inside Docker
docker exec openclaw-ruvector-db psql -U ruvector -d openclaw_vectors -c "SELECT * FROM _ruvector_health;"
```

### RuVector extension not installed (#175)

If `start.sh` warns about missing extension:

```bash
# Check the Docker image version
docker exec openclaw-ruvector-db cat /usr/share/postgresql/*/extension/ruvector.control

# If version < 2.0.3, update the image
docker compose pull ruvector-db
docker compose down -v  # Warning: destroys data
docker compose up -d
```

### HNSW search returns wrong number of results (#171)

```bash
# Check if indexes need rebuilding (after upgrade)
docker exec openclaw-ruvector-db psql -U ruvector -d openclaw_vectors -c "SELECT rebuild_all_indexes();"
```

### Grafana shows no data

```bash
# Check Grafana datasource connectivity
docker exec openclaw-grafana wget -qO- http://ruvector-db:5432 || echo "Cannot reach DB"

# Verify provisioning
docker exec openclaw-grafana ls /etc/grafana/provisioning/datasources/
docker exec openclaw-grafana ls /var/lib/grafana/dashboards/
```

## License

Private — see project configuration for details.
