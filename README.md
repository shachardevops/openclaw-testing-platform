# OpenClaw QA Dashboard

Next.js 15 (App Router) QA dashboard that orchestrates **OpenClaw multi-agent testing sessions** against the OrderTu application. Integrates the **Ruflo v3.5** pattern library for intelligent agent coordination, conflict-free data merging, reinforcement-learning model selection, and swarm-based parallel execution.

## Quick Start

```bash
docker compose up -d       # Start RuVector DB + Edge-Net dashboard
pnpm run                   # Install deps, index memory, verify services
pnpm dev                   # QA dashboard → http://localhost:3000
```

**Services started by `docker compose up -d`:**

| Service | Container | URL / Port |
|---------|-----------|------------|
| RuVector PostgreSQL | `ruvector` | `localhost:5433` |
| Edge-Net Dashboard | `ruvector-edge-net` | `http://localhost:5173` |

> The Edge-Net dashboard requires `./RuVector` to be cloned first (see setup below).

`run.sh` runs all 8 bootstrap steps automatically:

| Step | What it does |
|------|-------------|
| 1. Prerequisites | Checks Node.js 18+, pnpm, Docker, Git, OpenClaw CLI, curl |
| 2. Dependencies | `pnpm install` for the dashboard |
| 3. RuVector DB | Starts/verifies the RuVector PostgreSQL Docker container |
| 4. Workspace | Creates symlinks (`results`, `reports-md`) and workspace dirs |
| 5. Memory index | Indexes memory files into RuVector with ONNX embeddings |
| 6. OpenClaw | Checks gateway health, controller session, active sessions |
| 7. Containers | Lists all project Docker containers and checks port conflicts |
| 8. Endpoints | Verifies all service URLs are reachable |

Use `pnpm run --status` to check the health of everything without starting or changing anything. See below for manual setup steps.

### Prerequisites

- Node.js 18+
- pnpm
- Docker (for RuVector PostgreSQL vector database)
- OpenClaw CLI installed and configured
- Active OpenClaw gateway (for agent spawning and chat)
- Internet connection on first run (RuVector downloads ONNX model ~23MB from HuggingFace)

### Docker Services Setup

The repo includes a `docker-compose.yml` that runs all infrastructure the QA dashboard depends on (besides the dashboard itself, which runs via `pnpm dev`).

#### Step 1 — Clone RuVector (needed for the Edge-Net dashboard build)

```bash
git clone https://github.com/ruvnet/RuVector.git
```

#### Step 2 — Start all services

```bash
docker compose up -d
```

This starts:

| Service | Container | Port | Description |
|---------|-----------|------|-------------|
| **RuVector PostgreSQL** | `ruvector` | 5433 | Vector database (v0.3.0) with 230+ SQL functions |
| **Edge-Net Dashboard** | `ruvector-edge-net` | 5173 | RuVector frontend for browsing vectors and collections |

Default credentials: `ruvector` / `ruvector`, database: `ruvector_test`. The RuVector extension is auto-initialized on first start via `scripts/init-ruvector.sql`.

> Port 5433 is used by default to avoid conflict with a local PostgreSQL on 5432. Override with `RUVECTOR_PORT=5432 docker compose up -d`. Edge-Net port is configurable via `EDGE_NET_PORT`.

#### Step 3 — Verify

```bash
# Check containers are running
docker compose ps

# Verify RuVector extension
docker exec -it ruvector psql -U ruvector -d ruvector_test -c "SELECT ruvector_version();"

# Open Edge-Net dashboard
open http://localhost:5173
```

#### Step 4 — Index memory files

```bash
pnpm index-memory
```

#### Managing services

```bash
docker compose ps        # Status
docker compose logs -f   # Stream logs
docker compose stop      # Stop all
docker compose up -d     # Restart all
docker compose down      # Stop and remove containers
docker compose down -v   # Stop, remove containers and data volume
```

#### Running RuVector tests & benchmarks (from source)

```bash
cd RuVector/crates/ruvector-postgres/docker
docker compose run --rm test-runner                    # Test suite
docker compose --profile benchmark up benchmark        # Benchmarks
docker compose --profile dev run --rm dev              # Dev environment
```

### Environment

The dashboard reads workspace paths from `lib/config.js`. By default:

- **Results**: `~/.openclaw/workspace/qa-dashboard/results/`
- **Reports**: `~/.openclaw/workspace/qa-dashboard/reports-md/`

Root-level symlinks (`results`, `reports-md`, `pipeline-config.json`) point to these locations. Ensure they exist before running.

---

## Architecture Overview

```
Browser (React 19)
  |
  v
Next.js App Router (API routes, all runtime = 'nodejs')
  |
  ├─ OpenClaw CLI bridge (lib/openclaw.js)
  │    └─ child_process.spawn (detached, fire-and-forget)
  |
  ├─ Ruflo v3.5 modules (lib/ruflo/)
  │    ├─ CRDT stores       — conflict-free result & memory merging
  │    ├─ Stream chains      — NDJSON event pipelines
  │    ├─ Consensus engine   — BFT session health voting
  │    ├─ SONA / RL router   — adaptive model selection
  │    ├─ Swarm queen        — DAG-based parallel execution
  │    ├─ Anti-drift         — stall & repetition detection
  │    └─ Knowledge graph    — entity relationships + PageRank
  |
  └─ Orchestrator engine (lib/orchestrator-engine.js)
       └─ Deterministic escalation: stale → nudge → swap → kill
```

### Core Data Flow

```
1. UI dispatches task    → POST /api/run-agent-start
2. Server spawns agent   → OpenClaw CLI (detached child_process)
3. Agent writes results  → workspace/results/{taskId}.json
4. Dashboard polls       → GET /api/results (every 2s)
5. Report auto-finalize  → lib/report-parser.js from reports-md/
6. Context updates       → React reducer → UI re-renders
```

---

## Project Configuration

All per-project config lives in `config/<projectId>/`:

| File | Purpose |
|------|---------|
| `project.json` | Project metadata, message templates, escalation thresholds, model fallback |
| `tasks.json` | Task definitions with dependencies, default models, complexity |
| `models.json` | Available model IDs and display names |
| `skills.json` | Optional skills to attach to agent runs |
| `pipelines.json` | Named pipeline sequences |
| `pipeline-config.json` | Controller session ID, role/specialist pipelines |
| `memory/` | Agent learnings, known bugs, run logs, RL state |
| `requirements/` | Output format specs, bug templates, checklists |

### Message Templates

Defined in `project.json` under `messageTemplates`. These prefixes route commands through the controller session:

```json
{
  "messageTemplates": {
    "run": "[dashboard-run]",
    "cancel": "[dashboard-cancel]",
    "nudge": "[dashboard-nudge]",
    "chat": "[dashboard-chat]",
    "kill": "[dashboard-kill]",
    "modelSwap": "[dashboard-model-swap]"
  }
}
```

### Session Manager Escalation

Configured in `project.json` under `sessionManager.escalation`:

```json
{
  "escalation": {
    "staleThresholdMs": 180000,
    "swapThresholdMs": 480000,
    "killThresholdMs": 900000
  }
}
```

The orchestrator engine applies these deterministically: **stale** (3min) -> nudge -> **swap** (8min) -> **kill** (15min).

---

## Ruflo v3.5 Pattern Library

The `lib/ruflo/` directory contains the full Ruflo integration. Each module is a self-contained unit with clear responsibilities.

### 1. Error Handling & Retry

**Files**: `errors.js`, `retry.js`

Consistent error hierarchy with HTTP status codes and retryability flags.

```js
import { ValidationError, GatewayError, toErrorResponse } from '@/lib/ruflo/errors';
import { withRetry } from '@/lib/ruflo/retry';

// Errors auto-map to HTTP status codes
throw new ValidationError('taskId required');    // 400, non-retryable
throw new GatewayError('connection refused');     // 502, retryable

// Retry only retryable errors with exponential backoff
const result = await withRetry(
  () => fetchFromGateway(),
  { maxAttempts: 3, baseDelayMs: 1000 }
);
```

### 2. Config Validation

**File**: `config-validator.js`

Advisory (non-blocking) validation at startup. Returns warnings, never crashes.

```js
import { validateProjectConfig, validateTaskRouting } from '@/lib/ruflo/config-validator';

const warnings = validateProjectConfig(projectConfig);
// ["Missing messageTemplates.run", "staleThresholdMs >= swapThresholdMs"]
```

### 3. Agent Booster (Fast-Path)

**File**: `agent-booster.js`
**API**: `GET /api/ruflo/booster` (stats)

Bypasses LLM spawning for simple operations. Register custom fast-path handlers:

```js
import { tryFastPath, registerFastPath, getBoosterStats } from '@/lib/ruflo/agent-booster';

// Try fast path before spawning
const result = tryFastPath('update-result-status', { taskId, status: 'passed' });
if (result.handled) return result.result; // No agent spawn needed

// Register custom fast path
registerFastPath('my-operation',
  (op, ctx) => op === 'my-operation' && ctx.simple,
  (op, ctx) => ({ data: 'direct result' })
);
```

**Built-in fast paths**: `update-result-status`, `auto-fail-task`, `config-reload`, `read-result`

### 4. CRDT Data Stores

**Files**: `crdt.js`, `crdt-result-store.js`, `crdt-memory-store.js`

Conflict-free data merging for concurrent agent writes. No coordination needed.

```js
import { crdtRead, crdtWrite, crdtRemoveFinding } from '@/lib/ruflo/crdt-result-store';
import { readMemoryFile, writeMemoryFile } from '@/lib/ruflo/crdt-memory-store';

// Result files: counters grow-only, status is last-writer-wins, findings are OR-set
const result = await crdtRead('story-1');
await crdtWrite('story-1', {
  status: 'running',
  passed: 5,
  findings: [{ id: 'bug-1', text: 'Login fails' }]
}, 'agent-A');

// Memory files: section-level LWW merging
const memory = readMemoryFile('/path/to/known-bugs.md');
writeMemoryFile('/path/to/known-bugs.md', {
  'Known Bugs': '- Bug 1\n- Bug 2'
}, 'agent-B');
```

**CRDT types used**:
- `GCounter` — `passed`, `failed`, `warnings` (only increment)
- `LWWRegister` — `status`, `lastLog`, `progress`, `model`, timestamps
- `ORSet` — `findings` (add/remove without conflicts)

### 5. Stream Chains

**Files**: `stream-chain.js`, `stream-transforms.js`, `chain-bus.js`
**Hook**: `useStreamChain(chainId)`

NDJSON event pipelines for streaming task output.

```js
import { StreamChain, ndjsonParse, ndjsonStringify, createEvent } from '@/lib/ruflo/stream-chain';
import { filterByType, throttle, batch, tee } from '@/lib/ruflo/stream-transforms';

// Build a pipeline
const chain = new StreamChain();
chain.addStage(ndjsonParse());
chain.addStage(filterByType('finding'));
chain.addStage(throttle(1000));
chain.addStage(ndjsonStringify());
chain.build();

// Write events
chain.write(createEvent('finding', { text: 'Bug found' }));
```

**Event types**: `finding`, `test-result`, `checkpoint`, `progress`, `error`

**Client-side consumption**:

```jsx
import { useStreamChain } from '@/hooks/use-stream-chain';

function LiveOutput({ chainId }) {
  const { events, connected, clear } = useStreamChain(chainId);
  return events.map(e => <div key={e.ts}>{e.type}: {JSON.stringify(e)}</div>);
}
```

### 6. Semantic Search

**Files**: `semantic-search.js`, `ruvector-store.js`
**API**: `POST /api/ruflo/search`

Search across QA memory using vector similarity. Falls back to hash-based similarity when ONNX is unavailable.

```bash
# Search all collections
curl -X POST /api/ruflo/search \
  -d '{"query": "login button not clickable", "limit": 5}'

# Search specific collection
curl -X POST /api/ruflo/search \
  -d '{"query": "payment flow", "collection": "bugs", "limit": 3}'
```

**Collections**: `bugs`, `module-notes`, `run-history`, `agent-issues`, `decisions`

```js
import { findSimilarBugs, findRelevantNotes, searchAll } from '@/lib/ruflo/semantic-search';

const bugs = await findSimilarBugs('checkout page crashes', 5);
const notes = await findRelevantNotes('story-12', 3);
const all = await searchAll('payment timeout', 5);
```

### 7. Vector Database (RuVector Store)

**Files**: `ruvector-store.js`, `scripts/index-memory.mjs`
**Package**: [`ruvector`](https://github.com/ruvnet/RuVector) (installed as dependency)

The vector database powers all semantic search features using **RuVector** with local ONNX embeddings (`all-MiniLM-L6-v2`, 384 dimensions). No external API calls needed — the model downloads automatically on first run from HuggingFace.

**RuVector must be initialized before search will return results.** Collections start empty — without indexing, the semantic search API, context compressor, and Search tab will all return nothing.

#### Setup (Required)

**Step 1 — Index memory files into RuVector:**

```bash
# Index all markdown memory files (known-bugs.md, module-notes.md, run-log.md)
pnpm index-memory

# Or specify a project ID
pnpm index-memory ordertu-qa
```

On first run, RuVector downloads the ONNX model (~23MB) from HuggingFace. Subsequent runs use the cached model.

This produces real semantic embeddings — "login fails" will match "authentication error", unlike keyword-only search.

**Step 2 — Verify:**

```bash
# Test search via API (after pnpm dev is running)
curl -X POST http://localhost:3000/api/ruflo/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "login authentication error", "collection": "bugs", "limit": 3}'
```

#### Re-indexing

You **must re-index** whenever memory files change (new bugs found, module notes updated, new run logs). Otherwise search results will be stale.

```bash
# After memory files change
pnpm index-memory
```

Consider running this as a post-run hook to auto-reindex after each agent completes.

#### Collections

| Collection | Indexed From | Parse Strategy |
|------------|-------------|----------------|
| `bugs` | `known-bugs.md` | Split on `### ` headings, extract bug IDs (`S1-B01`) |
| `module-notes` | `module-notes.md` | Split on `## ` headings |
| `run-history` | `run-log.md` | Split on `### ` headings |
| `agent-issues` | API only | Added programmatically via `store.addEntry()` |
| `decisions` | API only | Added programmatically via `store.addEntry()` |

**Storage**: `config/<projectId>/memory/ruvector/<collection>.json`

#### Direct store usage

```js
import { getVectorStore } from '@/lib/ruflo/ruvector-store';

const store = await getVectorStore();

// Add an entry
await store.addEntry('bugs', {
  id: 'S3-B05',
  title: 'Checkout total miscalculated with coupons',
  text: 'When applying a percentage coupon, the total shows the pre-discount amount...',
  source: 'known-bugs.md',
});

// Search by natural language
const results = await store.search('coupon discount wrong', 'bugs', 5);
// → [{ id: 'S3-B05', title: '...', _score: 0.87, ... }, ...]

// Re-compute vectors for a collection
await store.reindex('bugs');

// Get collection stats
const stats = store.getCollectionStats();
// → { bugs: { count: 42 }, 'module-notes': { count: 15 }, ... }
```

### 8. Consensus Engine (BFT Health Voting)

**Files**: `consensus.js`, `consensus-sources.js`
**API**: `GET /api/ruflo/consensus?sessionId=<id>`

Five signal sources vote on session health using Byzantine Fault Tolerant consensus:

| Source | Weight | Signal |
|--------|--------|--------|
| session-registry | 2.0 | Session manager status |
| bridge-log | 1.5 | Log file modification time |
| result-file | 1.0 | Result JSON timestamps |
| gateway | 1.0 | Gateway health check |
| session-jsonl | 1.0 | Session JSONL mtime |

**Quorum**: Requires >= 4.0 weighted votes. If quorum is not reached, status is `uncertain` and escalation is deferred.

```bash
# Get health for specific session
curl /api/ruflo/consensus?sessionId=abc-123

# Get all session states
curl /api/ruflo/consensus
```

```js
import consensusEngine from '@/lib/ruflo/consensus';

const { status, votes, quorum } = await consensusEngine.getStatus('session-123');
// status: 'healthy' | 'stale' | 'dead' | 'uncertain' | 'unknown'
```

### 9. RL Router & SONA (Adaptive Model Selection)

**Files**: `rl-router.js`, `sona.js`, `task-router.js`
**API**: `GET /api/ruflo/rl`, `POST /api/ruflo/rl`

UCB1 contextual bandit that learns which models perform best per task context, wrapped by SONA (Self-Optimizing Neural Architecture) for adaptive exploration.

**Model selection resolution chain** (first match wins):
1. User override
2. Role pipeline (by actor type)
3. Specialist pipeline (by task group)
4. SONA/RL recommendation
5. Complexity heuristic (haiku for simple, opus for complex)
6. Load balancing (round-robin)
7. Task default model

```bash
# Get model recommendation for a task
curl "/api/ruflo/rl?taskId=story-1"
# → { modelId: "sonnet", confidence: 0.78, reason: "UCB1 exploit", source: "sona" }

# Get overall RL stats
curl /api/ruflo/rl
# → { rl: { arms, observations }, sona: { mode, epsilon, overrideRate } }

# Record outcome (trains the model)
curl -X POST /api/ruflo/rl \
  -d '{"action": "observe", "taskId": "story-1", "modelId": "sonnet", "outcome": {"passed": 8, "failed": 1, "bugsFound": 2, "durationMs": 120000}}'

# Set SONA mode
curl -X POST /api/ruflo/rl \
  -d '{"action": "set-mode", "mode": "research"}'
```

**SONA modes**:

| Mode | Features | Budget | Use case |
|------|----------|--------|----------|
| `edge` | 2 | 5ms | Ultra-fast, minimal context |
| `realtime` | 2 | 10ms | Low-latency decisions |
| `balanced` | 5 | 100ms | Default, good for most cases |
| `research` | 10 | 1000ms | Deep analysis, more exploration |
| `batch` | 10 | 5000ms | Offline analysis |

**Reward signal**: `+1.0` pass with bugs, `+0.5` clean pass, `+0.3` fail with findings, `0.0` fail empty, minus duration penalty.

### 10. Swarm Execution (Parallel Pipelines)

**Files**: `swarm-queen.js`, `swarm-scheduler.js`, `swarm-worker.js`
**API**: `GET /api/ruflo/swarm`, `POST /api/ruflo/swarm`
**Hook**: `useSwarmRunner({ dispatch, addLog, runTask })`

DAG-based parallel task execution with dependency resolution, concurrency limits, and adaptive rebalancing.

```bash
# Start a swarm
curl -X POST /api/ruflo/swarm \
  -d '{"action": "start", "pipelineId": "full-regression", "taskIds": ["story-1", "story-2", "story-3"], "mode": "adaptive"}'

# Check status
curl /api/ruflo/swarm

# Pause / Resume / Stop
curl -X POST /api/ruflo/swarm -d '{"action": "pause"}'
curl -X POST /api/ruflo/swarm -d '{"action": "resume"}'
curl -X POST /api/ruflo/swarm -d '{"action": "stop"}'

# Report task completion (from agent callback)
curl -X POST /api/ruflo/swarm \
  -d '{"action": "report-completion", "taskId": "story-1", "status": "passed"}'
```

**Execution modes**:

| Mode | Planning | Rebalance on Failure |
|------|----------|---------------------|
| `tactical` | Execute as-is | No |
| `strategic` | Plan task order | No |
| `adaptive` | Plan task order | Yes (redistributes on failure) |

**Client-side**:

```jsx
import { useSwarmRunner } from '@/hooks/use-swarm-runner';

function SwarmControl() {
  const { swarmStatus, startSwarm, stopSwarm, pauseSwarm, resumeSwarm } =
    useSwarmRunner({ dispatch, addLog, runTask });

  return (
    <button onClick={() => startSwarm('pipeline-1', ['story-1', 'story-2'], 'adaptive')}>
      Launch Swarm
    </button>
  );
}
```

### 11. Anti-Drift Detection

**File**: `anti-drift.js`
**API**: `GET /api/ruflo/drift?taskId=<id>`

Detects when agents get stuck, repeat actions, or drift from their objective.

```bash
# Check specific task
curl "/api/ruflo/drift?taskId=story-1"
# → { drifting: true, alerts: [{ type: "stall", message: "No progress for 10min" }] }

# Get all alerts
curl /api/ruflo/drift
```

**Detection types**:
- **Stall** — Progress unchanged for 10 minutes
- **Repetition** — Same action repeated 3+ times
- **Semantic drift** — Agent navigates 3+ unrelated URLs

### 12. Knowledge Graph & Reasoning Bank

**Files**: `knowledge-graph.js`, `reasoning-bank.js`, `context-compressor.js`, `context-cache.js`
**API**: `GET /api/ruflo/memory`, `POST /api/ruflo/memory`

Persistent memory layer linking stories, bugs, modules, models, and runs.

```bash
# Get stats
curl /api/ruflo/memory

# Query reasoning bank entries
curl "/api/ruflo/memory?type=query&storyId=story-1"

# Get distilled context for an agent
curl "/api/ruflo/memory?type=distill&storyId=story-1&model=sonnet"

# View knowledge graph
curl "/api/ruflo/memory?type=graph"

# Run PageRank
curl "/api/ruflo/memory?type=pagerank"

# Find communities
curl "/api/ruflo/memory?type=communities"

# Add a reasoning bank entry
curl -X POST /api/ruflo/memory \
  -d '{"action": "append", "entry": {"storyId": "story-1", "model": "sonnet", "passed": 8, "failed": 1, "bugsFound": ["BUG-42"]}}'

# Add graph nodes/edges
curl -X POST /api/ruflo/memory \
  -d '{"action": "add-node", "id": "story-1", "nodeType": "story", "data": {"name": "Login Flow"}}'
curl -X POST /api/ruflo/memory \
  -d '{"action": "add-edge", "from": "story-1", "relation": "has_bug", "to": "BUG-42", "weight": 1.0}'
```

**Context compression** (`forStory(storyId, model)`) produces a markdown context string by:
1. Looking up direct bugs from known-bugs.md
2. Semantic search for related bugs
3. Module notes for story pages
4. Recent run history summary

Results are cached per-story with mtime-based invalidation.

### 13. Quality Gate Hooks

**File**: `hooks.js`
**API**: `GET /api/ruflo/hooks`, `POST /api/ruflo/hooks`

Pre/post lifecycle hooks that can block or annotate task execution.

```bash
# List configured hooks
curl /api/ruflo/hooks

# Run hooks for a lifecycle point
curl -X POST /api/ruflo/hooks \
  -d '{"lifecycle": "pre-run", "context": {"taskId": "story-1", "model": "sonnet"}}'
# → { allowed: true, results: [...] }
```

Configure hooks in `.claude/hooks.json`:

```json
[
  {
    "lifecycle": "pre-run",
    "type": "command",
    "command": "scripts/check-gateway.sh"
  },
  {
    "lifecycle": "post-run",
    "type": "validator",
    "validator": "scripts/validate-result.js"
  }
]
```

Hook exit codes: `0` = allow, `2` = block, other = warn.

### 14. Decision Audit Trail

**File**: `decision-audit.js`

Immutable JSONL log of all orchestrator decisions. Auto-rotates at 500KB.

```js
import decisionAudit from '@/lib/ruflo/decision-audit';

// Log a decision
decisionAudit.log({
  conditionType: 'stale-session',
  target: 'session-123',
  source: 'consensus',
  action: 'nudge',
});

// Query recent decisions
const entries = decisionAudit.query({ source: 'consensus', limit: 10 });
```

**Path**: `config/<projectId>/memory/decision-audit.jsonl`

### 15. Checkpoint Store

**File**: `checkpoint-store.js`

Per-task checkpoint tracking for progress verification.

```js
import { recordCheckpoint, getProgress, verifyCheckpoints } from '@/lib/ruflo/checkpoint-store';

recordCheckpoint('story-1', { name: 'login-page-loaded', url: '/login' });
recordCheckpoint('story-1', { name: 'form-submitted' });

const progress = getProgress('story-1'); // Array of checkpoints
const complete = verifyCheckpoints('story-1', ['login-page-loaded', 'form-submitted']);
// → { complete: true, missing: [] }
```

### 16. WASM Validator

**File**: `wasm-validator.js`

High-performance validation with WASM, automatic JS fallback.

```js
import { validate } from '@/lib/ruflo/wasm-validator';

const errors = await validate('validate-result', { status: 'passed', passed: 5 });
// → [] (no errors)
```

**Built-in JS validators**: `validate-result`, `validate-report`, `validate-config`

---

## UI Components

### Ruflo Panel

The `<RufloPanel />` component provides a tabbed interface for all Ruflo features:

| Tab | Component | Description |
|-----|-----------|-------------|
| Swarm | `<SwarmPanel />` | Start/stop/pause swarm pipelines, view DAG layers |
| Consensus | `<ConsensusView />` | Session health votes and quorum status |
| Anti-Drift | `<DriftMonitor />` | Active alerts and drift detection |
| RL/SONA | `<RLInsights />` | Model selection stats, SONA mode, Q-table |
| Search | `<SemanticSearch />` | Cross-collection semantic search |
| Knowledge | `<KnowledgeGraphView />` | Entity graph, PageRank, communities |

Add to any page:

```jsx
import RufloPanel from '@/components/ruflo-panel';

export default function Page() {
  return <RufloPanel />;
}
```

---

## API Route Reference

### Existing Dashboard Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/run-agent-start` | Spawn an agent task |
| POST | `/api/run-agent-cancel` | Cancel a running task |
| GET | `/api/results` | Poll all task results |
| GET | `/api/gateway/health` | Gateway health check |
| POST | `/api/gateway/chat` | Send message to agent (supports SSE) |
| GET | `/api/orchestrator` | Orchestrator status |
| POST | `/api/orchestrator` | Orchestrator actions (pause/resume/nudge/swap/kill) |

### Ruflo Routes

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/ruflo/booster` | Agent booster fast-path stats |
| POST | `/api/ruflo/search` | Semantic search across collections |
| GET | `/api/ruflo/consensus?sessionId=` | Session health consensus |
| GET | `/api/ruflo/rl?taskId=` | Model recommendation / RL stats |
| POST | `/api/ruflo/rl` | Record outcome, set mode, record override |
| GET | `/api/ruflo/memory?type=` | Reasoning bank & knowledge graph queries |
| POST | `/api/ruflo/memory` | Append entries, add nodes/edges |
| GET | `/api/ruflo/swarm` | Swarm pipeline status |
| POST | `/api/ruflo/swarm` | Start/stop/pause/resume swarm |
| GET | `/api/ruflo/drift?taskId=` | Drift detection alerts |
| GET | `/api/ruflo/hooks` | List configured hooks |
| POST | `/api/ruflo/hooks` | Run lifecycle hooks |

---

## Data Persistence

All persistent Ruflo state is stored under `config/<projectId>/memory/`:

```
config/ordertu-qa/memory/
  ├── rl-q-table.json          # RL bandit Q-values
  ├── sona-state.json          # SONA adaptive state
  ├── reasoning-bank.json      # Run history ledger (max 500 entries)
  ├── knowledge-graph.json     # Entity-relationship graph
  ├── decision-audit.jsonl     # Immutable decision log (rotates at 500KB)
  ├── checkpoints/             # Per-task checkpoint files
  │   └── {taskId}.json
  └── ruvector/                # Vector store collections
      ├── bugs.json
      ├── module-notes.json
      └── run-history.json
```

CRDT metadata is stored alongside data files:
- Result files: `_crdt` field embedded in the JSON
- Memory files: `.crdt.json` sidecar next to the `.md` file

---

## Development Commands

```bash
pnpm run                   # Full ecosystem bootstrap
pnpm run --status          # Health check (read-only, changes nothing)
docker compose up -d       # Start RuVector DB + Edge-Net dashboard
docker compose ps          # Check container status
pnpm dev                   # Start QA dashboard (localhost:3000)
pnpm build                 # Production build
pnpm start                 # Start production server
pnpm lint                  # ESLint
pnpm index-memory          # Re-index memory into RuVector
```

---

## RuVector Edge-Net Dashboard

The [Edge-Net dashboard](https://github.com/ruvnet/RuVector/tree/main/examples/edge-net/dashboard) is the smoothest frontend for interacting with RuVector directly. Use it to browse vectors, run queries, and inspect collections.

### Via Docker Compose (recommended)

Already included in the project's `docker-compose.yml`. Just run:

```bash
docker compose up -d
# Edge-Net → http://localhost:5173
```

### Standalone — Dev Mode (with hot reload)

```bash
git clone https://github.com/ruvnet/RuVector.git
cd RuVector/examples/edge-net/dashboard
npm install
npm run dev
# Open http://localhost:5173 (Vite will print the actual port)
```

### Standalone — Production Build

```bash
cd RuVector/examples/edge-net/dashboard
npm install
npm run build
npm run preview
# Open http://localhost:4173
```

### Standalone — Docker (without compose)

```bash
cd RuVector/examples/edge-net/dashboard
docker build -t ruvector-edge-net-dashboard .
docker run -p 3001:80 ruvector-edge-net-dashboard
# Open http://localhost:3001
```

> Use port 3001 (not 3000) to avoid conflict with the QA dashboard.

---

## Troubleshooting

### Quick health check

```bash
pnpm run --status
```

This checks all prerequisites, services, containers, indexes, and sessions in read-only mode.

### RuVector / search not working
- Run `pnpm run --status` to see what's wrong
- Verify the Docker container is running: `docker ps | grep ruvector`
- If not running: `docker compose up -d` (from project root)
- Verify the database: `docker exec -it ruvector psql -U ruvector -d ruvector_test -c "SELECT ruvector_version();"`
- Re-index after memory file changes: `pnpm index-memory`
- Check that `.meta.json` files exist in `config/ordertu-qa/memory/ruvector/`

### Agent spawn fails
- Verify OpenClaw CLI is installed: `openclaw --version`
- Check gateway is running: `curl /api/gateway/health`
- Verify controller session ID in `pipeline-config.json`

### Results not updating
- Check symlinks: `ls -la results reports-md`
- Ensure workspace dirs exist: `~/.openclaw/workspace/qa-dashboard/`
- Verify polling is active in browser DevTools network tab

### Consensus shows "uncertain"
- Not enough signal sources reporting — check that gateway is reachable, session registry has entries, and bridge log files exist
- Quorum requires >= 4.0 weighted votes

### SONA recommends wrong models
- Check observation count: `GET /api/ruflo/rl` — needs 10+ observations to be meaningful
- Record override to train: `POST /api/ruflo/rl` with `action: "override"`
- Switch to `research` mode for more exploration: `POST /api/ruflo/rl` with `action: "set-mode", mode: "research"`

### Drift false positives
- Adjust thresholds by passing config to `antiDrift.check(taskId, { stallTimeoutMs: 900000 })`
- Resolve alerts: `antiDrift.resolveAlert(index)`
