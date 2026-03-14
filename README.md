# OpenClaw Testing Platform

Multi-agent QA dashboard that orchestrates [OpenClaw](https://github.com/openclaw) testing sessions. Built with Next.js 15 (App Router), React 19, and Tailwind CSS 4.

## Table of Contents

- [What It Does](#what-it-does)
- [Technology Stack](#technology-stack)
- [Architecture Overview](#architecture-overview)
- [How Everything Works Together](#how-everything-works-together)
  - [OpenClaw — Multi-Agent Swarm Execution](#1-openclaw--multi-agent-swarm-execution)
  - [Orchestrator — Deterministic Session Management](#2-orchestrator--deterministic-session-management)
  - [RuVector — Semantic Vector Memory](#3-ruvector--semantic-vector-memory)
  - [Pipeline System — Sequential Task Orchestration](#4-pipeline-system--sequential-task-orchestration)
  - [Resilience Layer — Enterprise-Grade Fault Tolerance](#5-resilience-layer--enterprise-grade-fault-tolerance)
  - [Learning Loop — Continuous Improvement](#6-learning-loop--continuous-improvement)
  - [Direct AI Integration — Multi-SDK Routing](#7-direct-ai-integration--multi-sdk-routing)
  - [Swarm Visibility — Real-Time Multi-Agent State](#8-swarm-visibility--real-time-multi-agent-state)
  - [Knowledge Graph — Interactive System Visualization](#9-knowledge-graph--interactive-system-visualization)
- [Data Flow Summary](#data-flow-summary)
- [Prerequisites](#prerequisites)
- [Installation Guide](#installation-guide)
- [Services](#services)
- [Development Commands](#development-commands)
- [Project Structure](#project-structure)
- [Component Reference](#component-reference)
- [API Route Reference](#api-route-reference)
- [Hooks Reference](#hooks-reference)
- [Core Libraries Reference](#core-libraries-reference)
- [State Management](#state-management)
- [Configuration Reference](#configuration-reference)
- [Test Stories](#test-stories)
- [Docker Infrastructure](#docker-infrastructure)
- [RuVector Integration](#ruvector-integration)
- [Error Handling](#error-handling)
- [Security](#security)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## What It Does

The platform spawns and manages AI agents that run QA test stories against a target application (OrderTu). It provides:

- **Task execution** — dispatch test stories to AI agents with configurable models and skills
- **Pipeline orchestration** — run multiple tasks in sequence with quality gates between stages
- **Session management** — automatic escalation (nudge → model swap → kill) for stuck agents
- **Live monitoring** — real-time log streaming, result polling, and drift detection
- **Direct AI integration** — multi-SDK routing (Claude, OpenAI/Codex) with cost-saving heuristics
- **Swarm visibility** — real-time multi-agent state, topology, and timeline
- **Knowledge graph** — interactive React Flow visualization of system relationships
- **Vector memory** — semantic search over past learnings, decisions, and patterns via RuVector
- **Self-healing** — circuit breakers, retry with backoff, and automated recovery workflows
- **Learning loop** — continuous improvement from task results and orchestrator decisions
- **Browser recording** — CDP-based screencast capture and playback for visual QA

---

## Technology Stack

| Category | Technology | Version |
|----------|-----------|---------|
| **Framework** | Next.js (App Router) | 15 |
| **UI** | React | 19 |
| **Styling** | Tailwind CSS | 4 |
| **Language** | JavaScript (TypeScript-capable, `strict: false`, `allowJs: true`) | ES2022+ |
| **Package Manager** | pnpm | 9+ |
| **AI SDKs** | `@anthropic-ai/sdk` (Claude), `openai` (Codex/GPT) | latest |
| **Graph Visualization** | `@xyflow/react` (React Flow) | 12+ |
| **Markdown Rendering** | `react-markdown` | 10+ |
| **WebSockets** | `ws` | 8+ |
| **Vector Database** | RuVector (PostgreSQL + HNSW + GNN) | latest |
| **Monitoring** | Grafana | latest |
| **DB Management** | pgAdmin 4 | latest |
| **Container Runtime** | Docker Compose | 2.0+ |
| **Testing** | Vitest | 4+ |
| **Linting** | ESLint + eslint-config-next | 8 / 15 |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         OPENCLAW TESTING PLATFORM                       │
│                                                                         │
│  ┌───────────┐    ┌──────────────┐    ┌──────────────────────────────┐ │
│  │  React UI │───→│  API Routes  │───→│  OpenClaw CLI (Multi-Agent)  │ │
│  │  (Next.js)│←───│  (Node.js)   │    │  Fire-and-forget spawns      │ │
│  └───────────┘    └──────────────┘    └──────────────────────────────┘ │
│       ↕                ↕                         ↕                     │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              ORCHESTRATOR ENGINE (30s tick)                      │   │
│  │  Drift Detection → Decision Tree → Consensus → Action          │   │
│  │  Autonomy Levels: 0=manual → 4=adaptive                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│       ↕                ↕                         ↕                     │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │ RuVector │  │ Memory Tiers │  │ Resilience Layer                │ │
│  │ DB       │  │ Work→Epis→   │  │ Self-Healing + Circuit Breaker  │ │
│  │ (Docker) │  │ Semantic     │  │ Task Claims + Quality Gates     │ │
│  └──────────┘  └──────────────┘  │ Audit Trail + Token Tracking    │ │
│       ↕                          └─────────────────────────────────┘ │
│  ┌──────────┐  ┌──────────────┐                                     │
│  │ Grafana  │  │ pgAdmin      │                                     │
│  │ (Docker) │  │ (Docker)     │                                     │
│  └──────────┘  └──────────────┘                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How Everything Works Together

The platform combines nine major subsystems into a unified QA automation engine.

### 1. OpenClaw — Multi-Agent Swarm Execution

OpenClaw is the AI agent runtime. The dashboard acts as a **control plane** that dispatches tasks to a **controller session** (a persistent OpenClaw agent). The controller then spawns individual agent sessions for each QA task.

**Dispatch flow:**

```
User clicks "Run" in dashboard
  → POST /api/run-agent-start
  → Renders message template from project.json (e.g., "[dashboard-run] Task: login-flow...")
  → lib/openclaw.js spawnAgent() — child_process.spawn(detached, unref)
  → OpenClaw CLI sends message to controller session via gateway
  → Controller spawns a sub-agent with the specified model
  → Sub-agent reads the test story (stories/{taskId}.md)
  → Executes test cases against target app (OrderTu)
  → Writes results to ~/.openclaw/workspace/qa-dashboard/results/{taskId}.json
  → Dashboard polls GET /api/results every 2-8s → UI updates
```

**Key design decisions:**
- **Fire-and-forget**: `spawn()` with `detached: true` + `unref()`. The dashboard never blocks on agent execution.
- **Message prefixes**: `[dashboard-run]`, `[dashboard-cancel]`, `[dashboard-nudge]`, `[dashboard-kill]`, `[dashboard-model-swap]` — these route commands through the controller.
- **Session ID resolution**: Reads from `pipeline-config.json` or `OPENCLAW_SESSION_ID` env var. Cached 30s to avoid blocking CLI calls.

### 2. Orchestrator — Deterministic Session Management

The orchestrator engine (`lib/orchestrator-engine.js`, 1300+ lines) runs a **30-second tick loop** that monitors all active agent sessions and takes corrective action.

**Three-layer decision architecture:**

| Layer | What It Does | Speed |
|-------|-------------|-------|
| **L1 — Condition Tracker** | Deduplicates events so the same stale session doesn't trigger repeated nudges | Instant |
| **L2 — Deterministic Decision Tree** | Pattern-matching: stale → nudge → model swap → kill. Orphaned → purge. Duplicate → kill one. | Instant |
| **L3 — AI Consultation** | Unrecognized patterns sent as one-shot gateway chat. Decision stored in `decision-memory.json`. On next occurrence, acts from memory (no AI). | ~2-5s |

**Escalation ladder** (configurable in `project.json`):

```
Session healthy ──→ reset escalation level
                    │
Session stale (3min) ──→ Nudge ("Continue your work, you appear stuck")
                         │
Still stale (8min) ──→ Model Swap (switch to fallback model without restart)
                       │
Still stale (15min) ──→ Kill (terminate session, mark task failed)
```

**Autonomy levels** control how much the orchestrator can do without human approval:

| Level | Name | Auto Actions |
|-------|------|-------------|
| 0 | Manual | None — all actions require confirmation |
| 1 | Supervised | Auto-nudge only |
| 2 | Guided | Auto-nudge + auto-swap |
| 3 | Autonomous | Full auto + AI consultation |
| 4 | Adaptive | Full auto + auto-approve AI recommendations |

### 3. RuVector — Semantic Vector Memory

[RuVector](https://github.com/ruvnet/ruvector) provides semantic search over QA knowledge. Instead of exact-match lookups, agents can find *similar* past experiences ("find runs where the agent got stuck on login flows").

**Three-tier memory architecture:**

```
                   ┌─────────────────────┐
                   │  SEMANTIC MEMORY     │  Persistent, high-value knowledge
                   │  200 entries         │  Auto-promoted from episodic
                   │  Min importance: 0.7 │  Survives restarts
                   └──────────↑──────────┘
                              │ consolidation (every 5min)
                   ┌──────────┴──────────┐
                   │  EPISODIC MEMORY     │  Recent patterns, time-decayed
                   │  500 entries         │  24h importance half-life
                   │  Updated on complete │
                   └──────────↑──────────┘
                              │ promotion
                   ┌──────────┴──────────┐
                   │  WORKING MEMORY      │  Fast, volatile LRU cache
                   │  100 entries         │  10min TTL
                   │  Current session     │  Checked every tick
                   └─────────────────────┘
```

**Vector collections (in RuVector PostgreSQL):**

| Collection | Stores | Used By |
|------------|--------|---------|
| `learnings` | "Bug found in X, solution Y" | Learning loop, agent context |
| `decisions` | "Orchestrator swapped model because Z" | Orchestrator Layer 3 |
| `patterns` | "Test X always fails with error Y" | Pipeline planning |

**Fallback chain:**
1. Native RuVector HNSW (if `ruvector` npm package installed) — sub-millisecond
2. In-memory TF-IDF + cosine brute-force (always available) — milliseconds
3. Keyword search (text contains) — milliseconds

### 4. Pipeline System — Sequential Task Orchestration

Pipelines run multiple test tasks in sequence with quality gates between stages:

```
Pipeline "smoke-tests"
  ├── Task: login-flow      ──→ Run ──→ Poll ──→ Quality Gate ──→ Pass
  ├── Task: menu-navigation ──→ Run ──→ Poll ──→ Quality Gate ──→ Pass
  ├── Task: order-flow       ──→ Run ──→ Poll ──→ Quality Gate ──→ Warn (maxP1Bugs)
  └── Task: payment-flow     ──→ Run ──→ Poll ──→ Quality Gate ──→ Complete
                                                       ↓
                                               Learning Loop records
                                               patterns + model stats
```

**Quality gate rules** (configurable):
- `minPassRate` — minimum % of tests that must pass
- `maxP1Bugs` — maximum critical bugs allowed
- `maxFailures` — maximum total test failures
- `requireReport` — markdown report must exist
- Fail action: `warn` (log + continue) or `block` (pause pipeline)

### 5. Resilience Layer — Enterprise-Grade Fault Tolerance

Multiple systems work together to keep the swarm healthy:

| System | Purpose | Key Pattern |
|--------|---------|-------------|
| **Self-Healing** | Automatic retry with backoff | Circuit breaker: CLOSED → OPEN (5 failures) → HALF_OPEN → CLOSED |
| **Drift Detection** | Prevent agents from going off-track | Checkpoint verification, silence alerts, output loop detection |
| **Consensus Validator** | Validate critical actions | Byzantine voting: 2/3 quorum for kill/recover/respawn |
| **Task Claims** | Prevent duplicate work | Exclusive ownership with 30min TTL auto-expiry |
| **Audit Trail** | Tamper-evident event log | SHA-256 hash-chained events, chain integrity verification |
| **Token Tracker** | Cost monitoring | Per-task/per-model usage, cost alerts at 100K/500K tokens |
| **Security Validator** | Input validation | Path traversal prevention, command injection blocking, rate limiting |

**How they connect during a recovery scenario:**

```
Agent session goes stale (3min no activity)
  → Drift detector flags "silence" event
  → Orchestrator Layer 2 picks up "stale" condition
  → Orchestrator proposes "nudge" action
  → Consensus validator checks:
      Orchestrator: approve (stale detected)
      Drift detector: approve (no active drift conflict)
      Self-healing: approve (circuit not open)
  → Quorum reached (3/3) → nudge approved
  → Task claims verified (task still owned by this session)
  → Nudge message sent via spawnAgent()
  → Audit trail records event with hash chain
  → Token tracker estimates cost impact
  → If nudge fails → escalate to model swap → kill
  → Self-healing circuit breaker tracks failure count
```

### 6. Learning Loop — Continuous Improvement

After each task completes, the learning loop extracts knowledge:

```
Task completes with results
  → RETRIEVE: Load existing patterns from learnings.json
  → JUDGE: Compare findings against known patterns
  → DISTILL: Extract new patterns (bug type, frequency, model effectiveness)
  → CONSOLIDATE: Store in vector memory + pattern DB
  → ROUTE: Update model stats for future routing decisions
```

**Model performance tracking:**
- Per-model pass/fail counts and average token usage
- Cost efficiency scoring
- Recommendations for 3-tier routing (simple → cheap model, complex → capable model)

### 7. Direct AI Integration — Multi-SDK Routing

The platform supports direct AI SDK calls (`lib/direct-ai.js`) for tasks that benefit from a specific provider:

| Provider | SDK | Use Case |
|----------|-----|----------|
| **Claude** | `@anthropic-ai/sdk` | Complex analysis, long-context tasks |
| **OpenAI/Codex** | `openai` | Code generation, fast completions |
| **Gateway** | OpenClaw gateway | Default routing through controller |
| **Cache** | In-memory | Repeated queries, cost reduction |

Routing heuristics assess task complexity and route to the most cost-effective model. The Direct AI tab in the UI allows manual provider selection.

### 8. Swarm Visibility — Real-Time Multi-Agent State

The swarm system (`lib/swarm-tracker.js`, `/api/swarm`) provides unified visibility into the multi-agent ecosystem:

- **Active agents list** — model, status, duration, task assignment
- **Topology view** — agent relationships and communication paths
- **Timeline** — chronological event stream per agent
- **Aggregate stats** — total agents, pass/fail rates, average completion time
- **Per-agent controls** — nudge, swap model, kill from the UI

### 9. Knowledge Graph — Interactive System Visualization

The knowledge graph (`components/knowledge-graph-content.jsx`) uses React Flow to visualize relationships between:

- Learnings (bug patterns, test outcomes)
- Orchestrator decisions (escalation actions, AI recommendations)
- Memory tiers (working → episodic → semantic promotions)
- Token usage and cost data
- Audit trail events

Nodes are color-coded by type, edges show data flow, and clicking a node shows details.

---

## Data Flow Summary

```
User Action           │ System Response
──────────────────────┼──────────────────────────────────────────
Click "Run Task"      │ → API → claim task → spawn agent → poll results
                      │ → orchestrator monitors session health
                      │ → drift detector watches for stalls/loops
Task completes        │ → quality gate evaluates pass/fail thresholds
                      │ → learning loop extracts patterns → vector memory
                      │ → token tracker records usage → cost alerts
                      │ → audit trail logs completion
Pipeline advances     │ → next task dispatched (if gate passes)
                      │ → previous learnings loaded into agent context
Agent gets stuck      │ → orchestrator nudges → swaps model → kills
                      │ → consensus validates critical actions
                      │ → self-healing retries with backoff
                      │ → circuit breaker prevents cascade
```

---

## Prerequisites

| Tool | Version | Required |
|------|---------|----------|
| Node.js | 18+ | Yes |
| pnpm | 9+ | Yes |
| Docker | 24+ | For vector DB |
| Docker Compose | 2.0+ | For vector DB |
| OpenClaw CLI | latest | For agent execution |

---

## Installation Guide

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

Edit `.env.local` with your settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCLAW_SESSION_ID` | (from pipeline-config.json) | Controller session ID |
| `OPENCLAW_PROJECT` | `ordertu-qa` | Active project ID |
| `OPENCLAW_GATEWAY_PORT` | `18789` | OpenClaw gateway port |
| `OPENCLAW_GATEWAY_TOKEN` | — | Gateway auth token |
| `ANTHROPIC_API_KEY` | — | Claude SDK key (for direct AI) |
| `OPENAI_API_KEY` | — | OpenAI SDK key (for direct AI) |
| `DIRECT_AI_CLAUDE_MODEL` | `claude-sonnet-4-6` | Claude model override |
| `DIRECT_AI_CODEX_MODEL` | `gpt-4.1` | OpenAI model override |
| `RUVECTOR_DB_PASSWORD` | `ruvector_secret` | PostgreSQL password |
| `RUVECTOR_DB_PORT` | `5433` | Database port |
| `PGADMIN_PORT` | `5050` | pgAdmin UI port |
| `PGADMIN_EMAIL` | `admin@openclaw.local` | pgAdmin login email |
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

### 4. Verify installation

```bash
# Check all services are running
./start.sh --status

# Run the build to verify compilation
pnpm build

# Run lint
pnpm lint

# Run smoke tests
pnpm test
```

---

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

---

## Development Commands

```bash
pnpm dev          # Start dev server (localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint (next/core-web-vitals)
pnpm test         # Run Vitest smoke tests
```

---

## Project Structure

```
openclaw-testing-platform/
├── app/                    # Next.js App Router
│   └── api/                # 41 API routes (all Node.js runtime)
├── components/             # 27 React UI components (all 'use client')
├── config/                 # Per-project configuration
│   └── ordertu-qa/         # OrderTu project config
│       ├── project.json    # Main project config (orchestrator, gates, escalation)
│       ├── tasks.json      # Task definitions (16 stories)
│       ├── models.json     # Available AI models
│       ├── skills.json     # Agent skills
│       ├── pipelines.json  # Pipeline definitions (smoke, full, buyer-flow)
│       ├── memory/         # Agent learnings, decision memory, run logs
│       ├── requirements/   # Output format, bug templates, checklists
│       └── screenshots/    # Reference screenshots by story
├── context/                # React Context (state management)
│   ├── dashboard-context.jsx   # Main state container
│   ├── dashboard-reducer.js    # Reducer logic
│   └── project-config-context.jsx  # Project config provider
├── docker/                 # Docker initialization files
│   ├── init-db.sql         # RuVector schema setup
│   ├── pgadmin-servers.json
│   └── grafana/            # Grafana provisioning + dashboards
├── hooks/                  # 14 custom React hooks
├── lib/                    # 26 core logic modules
│   ├── openclaw.js         # CLI bridge (spawn/exec/list)
│   ├── orchestrator-engine.js  # Deterministic decision engine (1300+ lines)
│   ├── vector-memory.js    # RuVector integration + in-memory fallback
│   ├── direct-ai.js        # Multi-SDK integration (Claude, OpenAI)
│   ├── drift-detector.js   # Anti-drift monitoring
│   ├── self-healing.js     # Circuit breaker + retry
│   ├── security-validator.js   # Input validation
│   ├── ruflo/              # Error hierarchy (errors.js)
│   └── ...                 # 18 additional modules
├── stories/                # 16 QA test story templates (markdown)
├── __tests__/              # Vitest smoke tests
│   └── api/                # API route validation tests
├── docker-compose.yml      # RuVector DB + pgAdmin + Server + Grafana
├── start.sh                # One-command startup script
├── .eslintrc.json          # ESLint config (next/core-web-vitals)
├── vitest.config.js        # Vitest config with @ path alias
└── .env.example            # Environment variable template
```

### Root Symlinks

Three root-level symlinks point outside the repo:
- `results` → `~/.openclaw/workspace/qa-dashboard/results`
- `reports-md` → `~/.openclaw/workspace/qa-dashboard/reports-md`
- `pipeline-config.json` → `config/ordertu-qa/pipeline-config.json`

---

## Component Reference

All UI components are client components (`'use client'`) using Tailwind CSS v4.

| Component | Purpose |
|-----------|---------|
| `app-log-tab.jsx` | Real-time application server logs with error/warning/success filtering, auto-scroll |
| `bridge-panel.jsx` | OpenClaw bridge connection status indicator |
| `direct-ai-tab.jsx` | Direct AI provider selection (Claude, Codex, Cache, Gateway) with model routing |
| `error-boundary.jsx` | React error boundary wrapper for graceful crash recovery |
| `event-log.jsx` | Timeline view of significant system events |
| `header.jsx` | Dashboard header with project name and branding |
| `knowledge-graph-content.jsx` | Interactive React Flow graph (learnings, decisions, patterns, memory) |
| `knowledge-graph-tab.jsx` | Lazy-loaded wrapper for the knowledge graph |
| `model-selector.jsx` | AI model dropdown picker |
| `orchestrator-tab.jsx` | Orchestrator status: decision tree, actions, AI recommendations, autonomy control |
| `pipeline-bar.jsx` | Pipeline progress indicator |
| `pipeline-builder.jsx` | Custom pipeline editor: select, order, save task sequences |
| `pipeline-editor.jsx` | Pipeline rename/delete modal |
| `progress-bar.jsx` | Horizontal progress bar with pass/fail color coding |
| `recording-player.jsx` | Browser screencast playback with viewport detection (mobile/tablet/desktop) |
| `session-browser.jsx` | Historical session list with model/duration/result info |
| `session-manager-tab.jsx` | Active session monitoring with escalation threshold display |
| `session-monitor.jsx` | Compact session health status badge |
| `session-panel.jsx` | Main right-side panel with 9 tabs (Session, Logs, History, Orchestrator, etc.) |
| `skill-badge.jsx` | Skill label with icon |
| `skill-picker.jsx` | Multi-select skill picker for tasks |
| `stats-bar.jsx` | Results summary (passed/failed/warnings counts) |
| `status-badge.jsx` | Task status indicator (running, passed, failed, queued) |
| `swarm-tab.jsx` | Swarm visualization: active agents, topology, timeline, per-agent controls |
| `task-card.jsx` | Individual task card: model selector, skills, status, findings, run/cancel buttons |
| `task-grid.jsx` | Grid layout for task cards |
| `test-plan-editor.jsx` | Test plan editor UI |

---

## API Route Reference

All API routes use `runtime = 'nodejs'` and return `{ ok, data/error }` JSON. 41 endpoints total.

### Core Task Execution

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/run-agent-start` | POST | Dispatch a test task to an agent with model, skills, learnings |
| `/api/run-agent-cancel` | POST | Cancel a running task |
| `/api/results` | GET | Poll all task results with auto-finalization from markdown reports |
| `/api/results/[agentId]` | GET, DELETE | Single task result with detailed findings |
| `/api/report-md` | GET | Fetch markdown reports from workspace |

### Session & Orchestration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/orchestrator` | GET, POST | Orchestrator engine status and actions (nudge/swap/kill/recover) |
| `/api/sessions` | GET | List all active OpenClaw sessions |
| `/api/sessions/[sessionId]` | GET | Single session details |
| `/api/session-manager` | GET, POST | Session lifecycle: registry, escalation, health checks |
| `/api/session-monitor` | GET | Real-time session health polling |
| `/api/session-history` | GET | Incremental task session history |
| `/api/orphaned-sessions` | GET | Detect stale sessions for cleanup |

### Intelligence & Learning

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/learning-loop` | GET, POST | RETRIEVE→JUDGE→DISTILL→CONSOLIDATE learning cycle |
| `/api/vector-search` | GET, POST | Semantic search across learnings, decisions, patterns |
| `/api/memory-tiers` | GET, POST | Three-tier memory management (working/episodic/semantic) |
| `/api/drift-detector` | GET, POST | Multi-agent goal drift detection |
| `/api/direct-ai` | GET, POST | Direct AI SDK integration with routing logic |
| `/api/token-tracker` | GET, POST | Per-task/per-model token usage and cost estimation |

### Resilience & Validation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/quality-gates` | GET, POST | Pre-pipeline validation (minPassRate, maxP1Bugs) |
| `/api/consensus` | GET, POST | Byzantine-style voting for critical actions |
| `/api/self-healing` | GET, POST | Circuit breaker + retry with backoff |
| `/api/task-claims` | GET, POST | Exclusive task ownership with TTL auto-expiry |
| `/api/audit-trail` | GET, POST | Hash-chained immutable event log (SHA-256) |
| `/api/security` | GET, POST | Input validation and rate limiting status |

### Infrastructure

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/gateway/health` | GET | OpenClaw gateway health check |
| `/api/gateway/chat` | GET, POST | Gateway chat proxy with SSE streaming |
| `/api/gateway/restart` | POST | Restart gateway service |
| `/api/app-health` | GET | Target application server health |
| `/api/app-server` | GET, POST | Start/stop/restart target app server |
| `/api/app-log` | GET | Application server logs with byte-offset pagination |
| `/api/swarm` | GET | Unified multi-agent swarm state |

### UI Support

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bridge-log` | GET | Bridge output with offset support |
| `/api/bridge-log/stream` | GET | SSE stream for bridge output |
| `/api/chat-send` | POST | Send chat message to controller |
| `/api/dashboard-state` | GET, POST | Persist/load dashboard UI state |
| `/api/project-config` | GET | Load merged project config |
| `/api/project-files` | GET, POST | Browse/upload project files |
| `/api/test-plan` | GET, POST | Load/save test plans |
| `/api/log-snapshot` | GET, POST | Capture app logs for specific findings |
| `/api/browser-screencast` | GET, POST | Browser CDP screencast control |
| `/api/recording` | GET, POST | Screencast metadata and recordings |

---

## Hooks Reference

14 custom React hooks — all client-side.

| Hook | Purpose |
|------|---------|
| `use-app-log.js` | Fetch app server logs with line classification and filtering |
| `use-bridge-stream.js` | SSE stream subscription to bridge output with auto-reconnect |
| `use-direct-ai.js` | Manage direct AI request routing and response parsing |
| `use-gateway.js` | Gateway health polling (30s interval) with auto-recovery |
| `use-knowledge-graph.js` | Fetch multi-source data and build React Flow graph nodes/edges |
| `use-orchestrator.js` | Poll orchestrator status (10s), expose pause/resume/nudge/swap/kill actions |
| `use-orphaned-sessions.js` | Detect and cleanup stale sessions |
| `use-persistence.js` | Save task skills/models/pipelines to localStorage |
| `use-pipeline-runner.js` | Sequential pipeline execution with auto-advance and quality gate checks |
| `use-polling.js` | Generic interval-based polling utility |
| `use-screencast.js` | Browser CDP screencast discovery and frame polling |
| `use-session-history.js` | Incremental session history fetch with load-more and re-resolve |
| `use-session-manager.js` | Session registry polling and escalation dispatch |
| `use-swarm.js` | Fetch unified swarm state (5s interval) with agent drill-down |

---

## Core Libraries Reference

26 server-side modules in `lib/`.

| Module | Purpose |
|--------|---------|
| `app-health.js` | Target app health monitor: port check, log tailing, uptime |
| `app-log-ring.js` | Ring buffer for app logs (configurable retention/capacity) |
| `audit-trail.js` | Hash-chained event log (SHA-256) with replay and integrity verification |
| `browser-screencast.js` | Chrome DevTools Protocol: target discovery, screencast capture |
| `config.js` | Path resolution: workspace, results, reports, bridge logs (symlinks + env) |
| `consensus-validator.js` | Byzantine-style voting (quorum-based) for critical actions |
| `direct-ai.js` | Multi-SDK: Claude Anthropic, OpenAI, gateway fallback; cost tracking |
| `drift-detector.js` | Checkpoint verification, loop detection, silence alerts, scope checks |
| `graph-transforms.js` | React Flow graph builder from multi-source data |
| `learning-loop.js` | RETRIEVE→JUDGE→DISTILL→CONSOLIDATE cycle with model performance tracking |
| `memory-tiers.js` | Three-tier knowledge: working (10min LRU), episodic (time-decayed), semantic |
| `normalize-status.js` | Normalize task status to standard values |
| `openclaw.js` | CLI bridge: spawnAgent (fire-and-forget), execAgent (await), listSessions |
| `openclaw-gateway.js` | Gateway health checks and chat proxying |
| `orchestrator-engine.js` | Deterministic decision engine (1300+ lines): L1 dedup, L2 rules, L3 AI |
| `project-loader.js` | Merge project config from multiple JSON files with legacy fallback |
| `quality-gates.js` | Pre-pipeline validation with configurable fail actions |
| `report-parser.js` | Parse markdown reports: extract pass/fail/warning counts, auto-finalize |
| `screencast-recorder.js` | Frame buffering, metadata, file writing for browser recording |
| `security-validator.js` | Path traversal prevention, command injection blocking, rate limiting |
| `self-healing.js` | Exponential backoff, circuit breaker (CLOSED→OPEN→HALF_OPEN), fallback chains |
| `session-manager.js` | Session registry, health tracking, escalation, orphan detection |
| `swarm-tracker.js` | Multi-agent swarm state: agents, topology, timeline, stats |
| `task-claims.js` | Exclusive task ownership with TTL auto-expiry, claim/release/handoff |
| `token-tracker.js` | Per-task/per-model token usage, cost estimation, 3-tier routing |
| `vector-memory.js` | Semantic search: in-memory TF-IDF fallback or HNSW+GNN via RuVector |

---

## State Management

The dashboard uses React Context with a reducer pattern.

### Dashboard Context (`context/dashboard-context.jsx`)

Primary state container providing `useDashboard()` hook.

**State shape:**
- `results` — task result objects (status, findings, pass/fail counts)
- `pendingRuns` — set of currently dispatching task IDs
- `taskSkills` — per-task skill assignments
- `taskModels` — per-task model assignments
- `customPipelines` — user-defined pipeline sequences
- `activePipeline` — currently running pipeline info
- `logs` — event log entries
- `pollStatus` — polling state and last-polled timestamp
- `streaming` — bridge stream text

**Key actions:** `runTask`, `cancelTask`, `setTaskModel`, `attachSkill`, `detachSkill`, `addLog`, `setActivePipeline`

### Project Config Context (`context/project-config-context.jsx`)

Loads merged project configuration on mount, provides `useProjectConfig()` hook.

**Exposes:** tasks, models, skills, pipelines, project metadata, workspace paths

---

## Configuration Reference

### `config/ordertu-qa/project.json`

Master configuration file containing:

| Section | Purpose |
|---------|---------|
| `id`, `name`, `workspace` | Project identity and workspace path |
| `messageTemplates` | Template strings for controller messages (run, cancel, nudge, kill, swap) |
| `modelFallback` | Fallback model and error patterns that trigger swap |
| `sessionManager.escalation` | Stale/swap/kill thresholds in milliseconds |
| `driftDetection` | Checkpoint interval, silence threshold, loop detection settings |
| `qualityGates` | Pipeline advancement rules (minPassRate, maxP1Bugs, etc.) |
| `learningLoop` | Learning cycle configuration |
| `auditTrail` | Event categories and retention settings |
| `taskClaims` | TTL, auto-expiry, handoff settings |
| `consensus` | Voter list, quorum threshold |
| `selfHealing` | Retry limits, backoff config, circuit breaker thresholds |
| `memoryTiers` | Tier sizes, TTLs, consolidation intervals |
| `tokenTracking` | Cost models, alert thresholds, routing tiers |
| `vectorMemory` | Collection limits, dimension count, search settings |

### `config/ordertu-qa/tasks.json`

Task definitions:

```json
{
  "id": "story-1",
  "num": 1,
  "title": "Buyer Browses & Purchases",
  "actor": "Buyer",
  "icon": "cart",
  "defaultModel": "claude-sonnet",
  "defaultSkills": ["screenshot", "log-snapshot"],
  "deps": ["story-0"]
}
```

### `config/ordertu-qa/models.json`

Available AI models:

```json
{
  "id": "claude-sonnet",
  "shortName": "Sonnet",
  "color": "#6366f1",
  "family": "anthropic"
}
```

### `config/ordertu-qa/skills.json`

Agent skills with workspace/taskId placeholders:

```json
{
  "id": "screenshot",
  "name": "Screenshot",
  "description": "Take screenshots and save to {workspace}/screenshots/{taskId}/"
}
```

### `config/ordertu-qa/pipelines.json`

Predefined pipelines (ordered task lists):

```json
{
  "id": "smoke-test",
  "name": "Smoke Tests",
  "tasks": ["story-0", "story-1", "story-2"]
}
```

---

## Test Stories

16 QA test story templates in `stories/`, each a markdown file with test case tables.

| Story | Title | Actor(s) |
|-------|-------|----------|
| story-0 | Admin Foundation Setup | Admin |
| story-1 | Buyer Browses & Purchases | Buyer |
| story-2 | Admin Manages Order | Admin |
| story-3 | Supplier Manufactures | Supplier + Admin |
| story-4 | Distributor Sells & Returns | Distributor + Admin |
| story-5 | Cross-Portal Threads | All Roles |
| story-6 | Admin Manual Order | Admin |
| story-7 | Inventory Lifecycle | Admin |
| story-8 | Shipment Lifecycle | Admin |
| story-9 | Semi-Mounts & Assembly | Admin |
| story-11 | Activity Log & Audit Trail | Admin |
| story-12 | Supplier Orders (Admin) | Admin |
| story-13 | RTL, i18n & Localization | Admin |
| story-14 | Security & Access Control | All Roles |
| story-15 | Exploratory UI Deep Dive | All Roles |
| story-16 | Responsive UI & Mobile/Tablet Compliance | All Roles |

Each story includes:
- **Test case tables** with ID, step, expected outcome, severity
- **Dependency chains** linking to prerequisite stories
- **Actor specifications** for multi-portal testing
- **Reference screenshots** in `config/ordertu-qa/screenshots/`

---

## Docker Infrastructure

### Services

4 containerized services via `docker-compose.yml`:

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| `ruvector-db` | ruvnet/ruvector-postgres:latest | Vector database (PostgreSQL + HNSW + GNN) | 5433 |
| `ruvector-ui` | dpage/pgadmin4:latest | pgAdmin web UI | 5050 |
| `ruvector-server` | ruvnet/ruvector:latest | Standalone RuVector server | 8080 |
| `grafana` | grafana/grafana:latest | Monitoring dashboards | 3001 |

### Persistent Volumes

- `ruvector-data` — PostgreSQL data
- `ruvector-index-data` — HNSW index files
- `pgadmin-data` — pgAdmin configuration
- `grafana-data` — Grafana dashboards and state

### Initialization Files

| File | Purpose |
|------|---------|
| `docker/init-db.sql` | Creates vector extensions, tables (learnings, decisions, patterns), HNSW indexes, helper functions |
| `docker/pgadmin-servers.json` | Auto-configures RuVector DB server in pgAdmin |
| `docker/grafana/provisioning/datasources/ruvector.yml` | Grafana datasource for RuVector PostgreSQL |
| `docker/grafana/dashboards/ruvector-overview.json` | Pre-built monitoring dashboard |

---

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

### Defensive patterns in vector-memory.js

- **Input sanitization** — text truncated to 10KB, null bytes stripped, empty strings return early
- **Health check on init** — insert + search round-trip validates dimensions work correctly
- **Native failure fallback** — every native call (insert, search, getStats) is wrapped in try/catch with automatic fallback to in-memory
- **Result supplementation** — when HNSW returns fewer results than `limit`, brute-force fills the gap
- **Cold start awareness** — GNN needs ~100+ similar queries before improving. Core HNSW search works immediately

### Known Issues & Edge-Case Handling

All known RuVector issues are handled defensively. The platform remains fully functional even when issues are triggered — it falls back gracefully.

#### Open Issues (active bugs)

| Issue | Severity | Impact | Mitigation |
|-------|----------|--------|------------|
| [#258](https://github.com/ruvnet/ruvector/issues/258) | Medium | `SonaEngine.forceLearn()` silently drops trajectories | SonaEngine disabled (`enableLearning: false`) |
| [#257](https://github.com/ruvnet/ruvector/issues/257) | Medium | `SonaEngine.getStats()` returns Rust debug string | `safeParseRuVectorStats()` wrapper handles both formats |
| [#256](https://github.com/ruvnet/ruvector/issues/256) | High | MCP server `workers_create` has command injection | We never use MCP server — Node.js NAPI-RS only |
| [#254](https://github.com/ruvnet/ruvector/issues/254) | Low | `@ruvector/mincut-wasm` not published | Not used by this project |
| [#165](https://github.com/ruvnet/ruvector/issues/165) | Low | `@ruvector/rvdna` binaries not published | Not used by this project |

#### Closed Issues (fixed but guarded against)

| Issue | What Happened | Guard |
|-------|---------------|-------|
| [#175](https://github.com/ruvnet/ruvector/issues/175) | Docker image missing SQL — extension install fails | `init-db.sql` wraps in exception handler. `start.sh` verifies post-startup |
| [#171](https://github.com/ruvnet/ruvector/issues/171) | HNSW returns only 1 result on small tables | Supplements with in-memory brute-force. Health check validates on init |
| [#164](https://github.com/ruvnet/ruvector/issues/164) | HNSW segfault on tables >100K rows | Try/catch with in-memory fallback. `start.sh` warns if version <2.0.2 |
| [#167](https://github.com/ruvnet/ruvector/issues/167) | `ruvector_list_agents()` crashes PostgreSQL | Never called — standard SQL only |
| [#152](https://github.com/ruvnet/ruvector/issues/152) | HNSW errors on `COUNT(*)` | `safe_count()` function disables index scan |
| [#251](https://github.com/ruvnet/ruvector/issues/251) | SIMD stubs were no-ops | Not affected — HNSW search only |

### Post-upgrade maintenance

After upgrading `ruvnet/ruvector-postgres` Docker image:

```sql
-- Rebuild all HNSW indexes to pick up dimension/page layout fixes
SELECT rebuild_all_indexes();

-- Verify collection health
SELECT * FROM collection_stats();

-- Check extension version
SELECT * FROM _ruvector_health ORDER BY check_time DESC LIMIT 1;
```

---

## Error Handling

Standardized error hierarchy in `lib/ruflo/errors.js`:

| Error Class | Status | Retryable | Usage |
|------------|--------|-----------|-------|
| `DashboardError` | 500 | No | Base class |
| `ValidationError` | 400 | No | Invalid input, path traversal |
| `GatewayError` | 502 | Yes | OpenClaw gateway unavailable |
| `ConfigError` | 500 | No | Missing/malformed config |
| `ConsensusError` | 503 | Yes | Quorum not reached |

All routes use `toErrorResponse(error)` for consistent `{ ok: false, error, code }` JSON responses.

---

## Security

### Input Validation (`lib/security-validator.js`)

- **Path traversal prevention** — `isIdSafe()` validates all path-derived inputs (taskId, file params) before `path.join()`
- **Symlink escape prevention** — `fs.realpathSync()` resolves symlinks before traversal checks
- **Command injection blocking** — shell metacharacter detection on all CLI-bound inputs
- **Field sanitization** — per-field regex validation
- **Rate limiting** — per-action rate limits to prevent abuse

### Architecture Assumptions

- All mutation routes are **localhost-only dev tools** — no authentication required
- The dashboard runs as a local development tool, not a production-facing service
- Auth/CSRF protection is deferred for production hardening

---

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
# Rebuild indexes after upgrade
docker exec openclaw-ruvector-db psql -U ruvector -d openclaw_vectors -c "SELECT rebuild_all_indexes();"
```

### Grafana shows no data

```bash
# Check datasource connectivity
docker exec openclaw-grafana wget -qO- http://ruvector-db:5432 || echo "Cannot reach DB"

# Verify provisioning
docker exec openclaw-grafana ls /etc/grafana/provisioning/datasources/
docker exec openclaw-grafana ls /var/lib/grafana/dashboards/
```

### Tests fail

```bash
# Run tests with verbose output
pnpm test -- --reporter=verbose

# Check for path alias issues
cat vitest.config.js  # Should have @ alias
```

---

## License

Private — see project configuration for details.
