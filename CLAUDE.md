# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js 15 (App Router) QA dashboard that orchestrates OpenClaw multi-agent testing sessions against the OrderTu application. React 19, Tailwind CSS 4, TypeScript-capable (strict: false, allowJs: true). Uses pnpm.

## Commands

```bash
pnpm dev          # Start dev server (localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Next.js ESLint
```

## Architecture

### Core Data Flow

```
UI dispatch (runTask/cancelTask)
  → POST /api/run-agent-start or /api/run-agent-cancel
  → lib/openclaw.js spawnAgent() (fire-and-forget, detached child_process)
  → OpenClaw CLI writes results to workspace/results/{taskId}.json
  → Dashboard polls GET /api/results every 2s
  → lib/report-parser.js auto-finalizes from reports-md/{taskId}.md
  → context dispatch SET_RESULTS → UI updates
```

### Key Directories

- **app/api/** — 21 API routes. All use `runtime = 'nodejs'` (required for child_process/fs). Return `{ ok, data/error }` JSON.
- **context/** — `dashboard-context.jsx` is the main state orchestrator (results, pending runs, skills, models, pipelines, streaming). `project-config-context.jsx` loads project config from API.
- **hooks/** — `use-pipeline-runner.js` (sequential pipeline execution), `use-bridge-stream.js` (live output via byte-offset polling), `use-polling.js` (generic interval), `use-orchestrator.js` (orchestrator engine status polling + actions).
- **lib/** — `openclaw.js` (CLI bridge: spawnAgent/execAgent/listSessions), `config.js` (paths/workspace), `project-loader.js` (config resolution), `report-parser.js` (markdown → pass/fail counts), `orchestrator-engine.js` (deterministic decision engine for session recovery).
- **config/** — Per-project configs in `config/<projectId>/` (tasks.json, models.json, skills.json, pipelines.json, pipeline-config.json). Includes `memory/` (agent learnings, known bugs, run logs) and `requirements/` (output format, bug templates, checklists). Falls back to legacy `data/project.config.js`.
- **stories/** — QA test story templates (markdown with test case tables).

### Root Symlinks

Three root-level symlinks point outside the repo:
- `results` → `~/.openclaw/workspace/qa-dashboard/results`
- `reports-md` → `~/.openclaw/workspace/qa-dashboard/reports-md`
- `pipeline-config.json` → `config/ordertu-qa/pipeline-config.json`

### OpenClaw Integration Contract (Must Preserve)

1. **Message prefixes**: `[dashboard-run]`, `[dashboard-cancel]`, `[dashboard-nudge]`, `[dashboard-chat]`, `[dashboard-kill]`, `[dashboard-model-swap]`. These are how the controller session routes commands. Templates are defined in `config/<projectId>/project.json` under `messageTemplates`.
2. **Spawn pattern**: Fire-and-forget via `child_process.spawn` with `detached: true` + `unref()`. Never use custom sockets/webhooks.
3. **Session ID resolution**: `getControllerSessionId()` in lib/openclaw.js resolves from pipeline-config.json or env.
4. **Workspace indirection**: Results/reports live outside the repo (symlinked to `~/.openclaw/workspace/`). Path resolution goes through `lib/config.js`.

### Orchestrator Engine (Deterministic Decision Engine)

`lib/orchestrator-engine.js` is a module-level singleton (`OrchestratorEngine`) that deterministically handles session health and recovery:
- **Layer 1 — Condition Tracker**: Deduplicates events so the same stale/orphaned session doesn't trigger repeated actions.
- **Layer 2 — Deterministic Decision Tree**: Known patterns (stale → nudge → swap → kill, orphaned → purge, duplicate → kill, stuck → respawn) are handled without AI. Rate-limited to max 6 controller messages/minute.
- **Layer 3 — AI Consultation + Decision Memory**: Unrecognized patterns are sent as a one-shot gateway chat request. AI recommendations are stored in `config/<projectId>/memory/decision-memory.json` and flagged for human review. On next occurrence, the engine acts from memory without AI.
- Exposed via `/api/orchestrator` (GET status, POST pause/resume/nudge/swap/kill/recover/approve-recommendation/reject-recommendation) and `components/orchestrator-tab.jsx`.

### Gateway

`lib/openclaw-gateway.js` provides gateway health checks and chat proxying. Exposed via:
- `GET /api/gateway/health` — health status
- `POST /api/gateway/chat` — send/stream messages to agents (supports SSE streaming mode)

### Model Fallback

Configured in `project.json` under `modelFallback`. When an agent hits an API error matching `errorPatterns`, the dashboard sends a `[dashboard-model-swap]` message to switch to the fallback model without restarting the task.

### Session Manager Escalation

Configured in `project.json` under `sessionManager.escalation`. Thresholds: stale (3min) → nudge → swap (8min) → kill (15min). The orchestrator engine reads the session manager registry directly and applies escalation deterministically.

### State Management

The dashboard uses React Context with a reducer pattern (`dashboard-reducer.js`). Key state: results, pendingRuns, taskSkills, taskModels, customPipelines, activePipeline, logs, pollStatus, streaming.

### Component Patterns

- All UI components are client components (`'use client'`).
- Components use `useDashboard()` and `useProjectConfig()` hooks for state access.
- Task configuration: model is required, skills are optional. Both stored in context and resolved at run time.

### Known Sharp Edges

- `orphaned-sessions/route.js`: `listSessions()` is async but sometimes used as if synchronous.
- `lib/openclaw.js`: Mixed require/import style.
- Bridge log polling: Handle missing file and out-of-bounds offset cases.
- See `CLAUDE_CODE_PROMPT_GUIDE.md` for full list of guardrails and known issues.

## Path Alias

`@/*` maps to the repository root (configured in tsconfig.json and jsconfig.json).
