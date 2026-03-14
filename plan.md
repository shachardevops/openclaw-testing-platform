# Implementation Plan: Swarm Visibility + Full Codebase Fixes

## Overview
Two goals: (1) Complete swarm visibility in the Orchestrator tab — see every agent, their thinking history, model, session state, and routing decisions in one unified view. (2) Fix all critical issues found during code review to ensure everything works properly together.

---

## Phase 1: Fix Critical Bugs (Foundation)

### 1.1 Fix validateApiRequest() Signature Mismatch
**Files**: `app/api/direct-ai/route.js`, `lib/security-validator.js`
- `validateApiRequest(req, 'direct-ai')` is wrong — the function takes `(data, requiredFields[])`
- Fix: parse body first, then call `validateInput()` with proper field rules
- Check ALL other API routes for same broken pattern and fix consistently

### 1.2 Fix Hard-Coded macOS Paths in project.json
**File**: `config/ordertu-qa/project.json`
- Replace `/Users/shacharcohen/...` paths with `~/.openclaw/...` patterns
- Update `lib/project-loader.js` to resolve `~` to `os.homedir()` at runtime
- This ensures Mac compatibility is preserved while Linux/Docker also works

### 1.3 Fix Gateway Fallback Return Format in direct-ai.js
**File**: `lib/direct-ai.js` → `askWithGatewayFallback()`
- Gateway `sendChat()` returns OpenAI-format `{ choices: [...] }`
- The fallback path returns this raw — callers that expect `{ text, provider, model }` will break
- Fix: normalize gateway response in the fallback path to match direct SDK format

### 1.4 Fix Consensus Validator (Voters Never Registered)
**File**: `lib/orchestrator-engine.js`
- `consensus-validator.js` exports singleton but `registerVoter()` is never called
- Register orchestrator, drift-detector, and self-healing as voters during engine boot
- Without this, quorum is always 0 → all actions auto-approved (security hole)

---

## Phase 2: Agent Swarm Visibility (Primary Feature)

### 2.1 Create Unified Swarm Data Model
**New file**: `lib/swarm-tracker.js`
- Singleton that aggregates data from multiple sources into one swarm view:
  - Session Manager registry → active sessions with task mapping
  - Orchestrator Engine → decision log, escalation state, pending actions
  - Direct AI → routing decisions, model selections, cost tracking
  - Results → task status, pass/fail, findings
  - Bridge logs → agent thinking/output history
- Exposes `getSwarmState()` returning:
```js
{
  agents: [{
    sessionId, taskId, model, status,
    ageMs, escalationLevel,
    isController, parentSession,
    thinkingHistory: [{ timestamp, content, type }],
    routingDecisions: [{ timestamp, provider, model, complexity, cached }],
    modelSwapHistory: [{ from, to, reason, timestamp }],
    nudgeCount, swapCount,
    lastActivity, nextEscalationIn,
  }],
  topology: { controller, workers: [], orphans: [] },
  stats: { totalAgents, healthy, stale, stuck, orphaned, totalTokens, costSaved },
  timeline: [{ timestamp, event, agentId, details }],
}
```

### 2.2 Create Swarm API Route
**New file**: `app/api/swarm/route.js`
- `GET /api/swarm` — returns full swarm state (aggregated from all subsystems)
- `GET /api/swarm?agentId=xxx` — returns detailed single agent history
- Merges: session manager, orchestrator, direct-ai, bridge log, results

### 2.3 Create useSwarm Hook
**New file**: `hooks/use-swarm.js`
- Polls `/api/swarm` every 5 seconds
- Provides: `agents, topology, stats, timeline, selectedAgent, selectAgent`
- Memoizes derived data (filters, sorting)

### 2.4 Redesign Orchestrator Tab with Swarm View
**File**: `components/orchestrator-tab.jsx` (major rewrite)

New layout with 4 sub-sections:

**A. Swarm Topology Header**
- Visual map: Controller node in center, worker agents radiating out
- Each agent node shows: task ID, model, status dot (green/amber/red)
- Click agent → selects for detail view
- Stats bar: total agents, healthy/stale/stuck counts, total tokens, cost saved

**B. Agent Detail Panel (when agent selected)**
- Agent identity: session ID, task ID, model, age, escalation level
- Thinking history: scrollable log of agent output/reasoning from bridge log
- Model swap timeline: visual timeline of model changes with reasons
- Routing decisions: which AI provider was used, complexity tier, cached?
- Escalation countdown: "Next escalation in X:XX" with progress bar
- Quick actions: Nudge, Swap Model, Kill

**C. Decision Timeline (unified)**
- Chronological feed combining:
  - Orchestrator decisions (deterministic, AI-consulted, memory-recall)
  - Direct AI routing decisions (Claude/Codex/cache/gateway)
  - Session manager actions (nudge, swap, kill, dedup)
  - Drift detection alerts
- Each entry color-coded by source, with expandable details
- Filter by: source, agent, action type

**D. Autonomy & Controls**
- Autonomy level selector (0-4) with explanation of each level
- Pending confirmations panel (for autonomy < 3)
- Pending AI recommendations (approve/reject)
- Rate limit status
- Manual action panel (nudge/swap/kill with target dropdown)

### 2.5 Agent Thinking History Extraction
**File**: `lib/swarm-tracker.js` + `app/api/swarm/route.js`
- Read bridge log (`~/.openclaw/workspace/qa-dashboard/bridge.log`) per agent
- Parse JSONL entries to extract agent reasoning/output
- Cache parsed entries with byte-offset tracking (like existing bridge-log polling)
- Group by session/task for per-agent thinking history

---

## Phase 3: Wire Dead Code & Complete Integration

### 3.1 Wire Learning Loop to Task Completion
**Files**: `lib/learning-loop.js`, `app/api/results/route.js`
- Call `learningLoop.learnFromResult(taskId, result)` when task finalizes
- Feed patterns into vector memory for semantic cache

### 3.2 Wire Direct AI to Learning Loop
**Files**: `lib/direct-ai.js`, `lib/learning-loop.js`
- After direct AI calls, feed successful responses to learning loop
- Learning loop distills patterns → vector memory → future cache hits

### 3.3 Validate Security Across All Routes
**Files**: All `app/api/*/route.js`
- Audit every route that calls `validateApiRequest()`
- Fix to use correct validation function signature
- Add input sanitization for path/command injection vectors

---

## Phase 4: Cross-Platform & Robustness

### 4.1 Path Resolution Consistency
**Files**: `config/ordertu-qa/project.json`, `lib/project-loader.js`, `lib/config.js`
- project.json: use `~` prefix for home-relative paths
- project-loader.js: resolve `~` → `os.homedir()` at load time
- Verify all path operations use `path.join()` not string concatenation

### 4.2 Error Handling Hardening
- Fix silent `catch {}` blocks to log warnings
- Add retry logic for openclaw CLI timeouts in session manager
- Prevent cascade failures when CLI returns empty sessions list

---

## File Change Summary

| File | Action | Phase |
|------|--------|-------|
| `lib/security-validator.js` | Fix validateApiRequest | 1.1 |
| `app/api/direct-ai/route.js` | Fix validation call | 1.1 |
| `config/ordertu-qa/project.json` | Fix hardcoded paths | 1.2 |
| `lib/project-loader.js` | Add ~ resolution | 1.2 |
| `lib/direct-ai.js` | Fix gateway return format | 1.3 |
| `lib/orchestrator-engine.js` | Register consensus voters | 1.4 |
| `lib/swarm-tracker.js` | **NEW** — unified swarm data | 2.1 |
| `app/api/swarm/route.js` | **NEW** — swarm API | 2.2 |
| `hooks/use-swarm.js` | **NEW** — swarm hook | 2.3 |
| `components/orchestrator-tab.jsx` | Major rewrite — swarm view | 2.4 |
| `components/session-panel.jsx` | Update tab label | 2.4 |
| `lib/learning-loop.js` | Wire to results | 3.1 |
| `app/api/results/route.js` | Call learning loop on finalize | 3.1 |
| `lib/config.js` | Path resolution fixes | 4.1 |
