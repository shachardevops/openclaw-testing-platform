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

### 3. Start everything

```bash
./start.sh
```

This will:
1. Start Docker Compose (RuVector DB + pgAdmin UI + RuVector Server)
2. Create workspace directories (`~/.openclaw/workspace/qa-dashboard/`)
3. Start the Next.js dev server on `http://localhost:3000`

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
| pgAdmin | http://localhost:5050 | Database management UI |
| RuVector Server | http://localhost:8080 | Vector search API |
| RuVector DB | localhost:5433 | PostgreSQL with vector extensions |

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
│   ├── init-db.sql         # RuVector schema setup
│   └── pgadmin-servers.json
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

### Known limitations

- **SonaEngine self-learning is disabled** — upstream bugs [#257](https://github.com/ruvnet/ruvector/issues/257) (getStats returns Rust debug string) and [#258](https://github.com/ruvnet/ruvector/issues/258) (forceLearn always returns insufficient trajectories)
- **Cold start** — GNN needs ~100+ similar queries before improving results
- **MCP server** — do not use due to command injection risk ([#256](https://github.com/ruvnet/ruvector/issues/256))

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
```

## License

Private — see project configuration for details.
