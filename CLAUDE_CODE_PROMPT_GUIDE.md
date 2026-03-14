# Claude Code Prompt Guide — OpenClaw Dashboard Template

This guide is for running Claude Code against this repo so it integrates with **OpenClaw** correctly (without breaking control flow).

## 1) What this project is (quick map)

- **Frontend**: Next.js app router + React client components
- **API routes**: `app/api/*`
- **OpenClaw bridge layer**: `lib/openclaw.js`
- **Workspace path wiring**: `lib/config.js` + `data/project.config.js`
- **Run orchestration**: `context/dashboard-context.jsx` + `hooks/use-pipeline-runner.js`
- **Live bridge UI**: `components/bridge-panel.jsx` + `hooks/use-bridge-stream.js`
- **Session monitoring**: `components/session-monitor.jsx` + `hooks/use-orphaned-sessions.js`

The dashboard itself does **not** run QA directly. It sends control intents to OpenClaw (`openclaw agent --session-id ...`) and then reads artifacts from `results/` + `reports-md/`.

---

## 2) OpenClaw interaction contract (must preserve)

Claude must preserve these exact behaviors:

1. **Start run**
   - `POST /api/run-agent-start`
   - builds a controller message beginning with `[dashboard-run]`
   - includes task/story id, profile, model, optional skills
   - sends to controller via OpenClaw CLI

2. **Cancel run**
   - `POST /api/run-agent-cancel`
   - builds controller message beginning with `[dashboard-cancel]`

3. **Live bridge output**
   - reads from `results/bridge.log`
   - route: `GET /api/bridge-log` (incremental by byte offset)
   - client stream logic in `use-bridge-stream.js`

4. **Results polling**
   - `GET /api/results`
   - can auto-finalize from report markdown parser

5. **Orphaned sessions monitor**
   - `GET /api/orphaned-sessions`
   - list OpenClaw sessions and surface stale ones

6. **Controller session source of truth**
   - `pipeline-config.json` `controllerSessionId`
   - fallback env: `OPENCLAW_SESSION_ID`

Do **not** replace OpenClaw CLI bridge with custom sockets/webhooks unless explicitly requested.

---

## 3) Known sharp edges Claude should audit first

When starting work, tell Claude to verify these immediately:

- Keep `runtime = 'nodejs'` on API routes that call `child_process`.
- Never block long-running OpenClaw call in UI thread; keep spawn/detach for fire-and-forget starts.
- Validate path-derived inputs (`taskId`, file params) with `isIdSafe()` before `path.join()`.
- Use `fs.realpathSync()` to resolve symlinks before path traversal checks.

---

## 4) Golden prompt you can paste to Claude Code

```bash
cd /Users/shacharcohen/openclaw-dashboard-template
claude --permission-mode bypassPermissions --print "$(cat <<'PROMPT'
You are editing an OpenClaw-integrated Next.js dashboard.

Goal:
Investigate the project and improve OpenClaw integration reliability without changing product behavior.

Rules:
- Preserve API contract and route names.
- Preserve controller message prefixes: [dashboard-run], [dashboard-cancel].
- Keep OpenClaw CLI bridge via child_process (do not replace architecture).
- Keep all edits minimal and focused.
- Keep runtime='nodejs' on server routes using child_process.

Investigation checklist:
1) Trace full flow: UI action -> API route -> lib/openclaw.js -> OpenClaw CLI -> results/reports readback.
2) Identify integration bugs, async misuse, module mismatches, and failure handling gaps.
3) Fix only confirmed issues.

Required fixes (if present):
- Harden error handling around OpenClaw CLI failures (return clear structured JSON errors).
- Ensure bridge log handling is safe for missing file / offset edges.
- Validate all path-derived inputs with isIdSafe() before path.join().
- Use fs.realpathSync() to resolve symlinks before traversal checks.

Validation required:
- Run lint/type checks if configured.
- Verify API routes compile.
- Provide a concise manual test plan for:
  - start run
  - cancel run
  - bridge log updates
  - orphaned session polling

Output format:
1) Findings
2) Files changed
3) Unified diffs
4) Manual test steps
5) Commit message
PROMPT
)"
```

---

## 5) “Strict patch-only” variant (if you want less chatter)

```bash
cd /Users/shacharcohen/openclaw-dashboard-template
claude --permission-mode bypassPermissions --print "$(cat <<'PROMPT'
Edit this OpenClaw dashboard with minimal diffs.

Output only:
- CHANGED_FILES
- DIFF (unified)
- TEST_PLAN
- COMMIT_MESSAGE

Constraints:
- Do not rename routes.
- Do not change request/response shape unless necessary.
- Keep [dashboard-run]/[dashboard-cancel] prefixes.
- Keep OpenClaw CLI interaction in lib/openclaw.js.

Focus:
- Improve OpenClaw error surfaces (structured errors).
- Validate path inputs at API boundaries (isIdSafe, realpathSync).
- Preserve behavior everywhere else.
PROMPT
)"
```

---

## 6) Practical guardrails for Claude

- Prefer **small diffs** over refactors.
- Touch only files involved in the OpenClaw path.
- If changing API output, keep backwards compatibility fields.
- Never hardcode a new controller session id in code.
- Never remove workspace indirection (`data/project.config.js` workspace path).

---

## 7) Definition of done

- Run button triggers controller and logs in bridge stream.
- Cancel button issues cancel instruction and updates UI cleanly.
- Results polling remains live and stable.
- Orphaned sessions monitor works (no runtime error from promise/array mismatch).
- No regressions in pipeline execution UX.
