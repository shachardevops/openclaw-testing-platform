# Agent Learning Protocol

After every story run (pass or fail), the agent MUST update the shared learning memory to help future runs be faster and more accurate.

## Memory Location

`{workspace}/memory/` — this folder persists across all runs and sessions.

## Required Updates After Each Run

### 1. Update `{workspace}/memory/known-bugs.md`

Track every bug found across runs. Format:

```markdown
## {BUG-ID} — {Title}
- **Status:** open | fixed-in-r{N} | persists | wont-fix
- **Story:** {storyId}
- **Module:** {module}
- **First found:** r{N} ({date})
- **Last seen:** r{N} ({date})
- **Page:** `{URL}`
- **Description:** {one line}
- **Fix applied:** {what was changed, or "none yet"}
```

When you find a bug that's already listed: update `Last seen` and `Status`.
When a previously-listed bug is now fixed: update `Status` to `fixed-in-r{N}`.

### 2. Update `{workspace}/memory/agent-issues.md`

Record problems the agent itself encountered (not app bugs) and how they were solved:

```markdown
## {date} — {Issue title}
- **Problem:** {What went wrong — e.g., "Browser timed out navigating to inventory page with 578 items"}
- **Impact:** {What it caused — e.g., "Had to retry, lost 2 minutes of run time"}
- **Solution:** {How it was resolved — e.g., "Added wait_for_selector before interacting, increased timeout to 30s"}
- **Prevention:** {How to avoid in future — e.g., "Always wait for table rows to load before pagination checks"}
```

Categories of agent issues to track:
- **Navigation failures** — page didn't load, element not found, timeout
- **Data dependencies** — expected data missing, test data from previous run deleted
- **Tool errors** — browser tool returned error, file write failed
- **Session issues** — session expired, reconnection needed
- **Model issues** — wrong model used, token limit hit, response truncated
- **Workarounds** — things that required non-obvious approaches

### 3. Update `{workspace}/memory/module-notes.md`

Per-module cheat sheet with tips for faster testing:

```markdown
## Products (`/en/admin/products`)
- **Item count:** ~340 products, 17 pages
- **Known slow:** Detail page with 9 images takes 3-5s to load
- **Test account:** Admin portal at `/en/admin`
- **Gotchas:**
  - Pagination resets filters when going to last page
  - Search is debounced (wait 500ms after typing)
  - "Add Product" requires all required fields or silent validation fail
```

### 4. Update `{workspace}/memory/run-log.md`

Append a one-line entry per run:

```markdown
| Run | Story | Date | Model | Duration | Result | Pass | Fail | Warn | Notes |
|-----|-------|------|-------|----------|--------|------|------|------|-------|
| r6 | story-0 | 2026-03-09 | opus | 8m | passed | 18 | 0 | 4 | Large data import since r5 |
```

## Rules

1. **Always read memory files first** — Before starting a run, read all files in `{workspace}/memory/` to avoid repeating known issues
2. **Update memory before writing final result** — The memory update happens BEFORE `status: passed/failed` is written to the result JSON
3. **Never delete entries** — Only append or update status. History is valuable.
4. **Be concise** — One line per item in run-log, 3-5 lines per bug. Save details for the full report.
5. **Cross-reference** — When a bug from one story affects another, note it: "See also S2-B1"
