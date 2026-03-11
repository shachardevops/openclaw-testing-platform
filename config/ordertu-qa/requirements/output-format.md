# QA Report Output Format

Every story run MUST produce a markdown report at `{workspace}/reports-md/{taskId}.md` following this exact structure. The report is consumed by Claude Code for automated bug fixing — clarity and reproducibility are critical.

## Report Structure

```markdown
# QA Report — {Story Title}

**Run:** r{N}
**Date:** YYYY-MM-DD
**Model:** {model used}
**Browser Profile:** {profile}
**Environment:** {base URL}

## Scope
{One-line description of what this story covers}

## Findings

### {Module/Page Name} (`{URL path}`)

- ✅ PASS — {What was tested and worked}
- 🐛 BUG ({severity}) — {BUG-ID} — {Title}
  - **Where:** {exact page URL and element/section}
  - **Steps to reproduce:**
    1. Navigate to {URL}
    2. {Action taken}
    3. {What happened}
  - **Expected:** {What should happen}
  - **Actual:** {What actually happened}
  - **Recording / visual context:** {Describe what's visible — element positions, text content, viewport if relevant, and recording timestamp if helpful}
  - **Suggestion:** {How to fix — component name, likely cause}
- ⚠️ WARNING — {WARN-ID} — {Title}
  - **Where:** {URL and element}
  - **Details:** {What's wrong and why it matters}
  - **Suggestion:** {How to improve}

## Summary

| Metric | Count |
|--------|-------|
| Passed | {N} |
| Failed | {N} |
| Warnings | {N} |
| Blockers | {N} |

## Bugs for Fix

{List each BUG-ID with a one-line actionable summary for Claude Code}

| Bug ID | Severity | Module | Title | Fix Suggestion |
|--------|----------|--------|-------|----------------|
| S0-B1 | P2 | Products | Image upload fails silently | Check `onUpload` handler in `ProductMediaSection` |
```

## Severity Levels

- **P1 (Blocker):** Feature completely broken, blocks user workflow
- **P2 (Critical):** Feature partially broken, workaround exists
- **P3 (Major):** Cosmetic/UX issue that affects usability
- **P4 (Minor):** Cosmetic issue, nice to fix

## Bug ID Format

`S{storyNum}-B{bugNum}` for bugs, `S{storyNum}-W{warnNum}` for warnings.
Example: `S0-B1`, `S0-B2`, `S0-W1`

Persisted bugs should be tagged: `S0-B2 PERSISTS` (found in previous run, still present).

## Recordings and Responsive Evidence

The recording is the primary visual evidence source. Use the live browser and saved recording to support findings instead of standalone screenshots.

- **Reference in report:** mention the relevant viewport and, when useful, a recording timestamp such as `recording: 01:24 mobile viewport`
- **Desktop baseline:** confirm the core flow in the standard desktop viewport
- **Responsive coverage:** when the Responsive add-on is enabled, check breakpoint behavior beyond the default desktop layout
- **Mobile coverage:** when the Mobile add-on is enabled, repeat critical steps in a phone-sized viewport and explicitly call out mobile-only regressions
- **What to look for (MUST visually inspect each page):**
  - **Truncated text** — labels, badges, card titles cut off (e.g. "Low stock i..." should be "Low stock items")
  - **Crammed labels** — stepper/progress labels touching without spacing (e.g. "PendingConfirmedProcessingReady")
  - **Horizontal overflow** — content wider than viewport, unexpected scrollbars
  - **Overlapping elements** — z-index conflicts, elements stacking on top of each other
  - **Hidden/unreachable actions** — buttons or links pushed off-screen or under other elements
  - **Broken drawers/modals** — popups that extend beyond the viewport
  - **Unreadable tables** — columns too narrow, data truncated without tooltip/expand
  - **Touch-target issues** — interactive elements smaller than 44px on touch viewports
- **Report responsive issues as WARNINGs** — each visual issue is a separate WARNING finding with viewport, URL, element, and recording timestamp
- **Use recordings as evidence:** rely on the browser/recording timeline for broken states, warnings, and app-log snippets

## Rules for Claude Code Consumption

1. **Always include the URL path** — Claude Code needs to know which file/component to look at
2. **Always include steps to reproduce** — exact click sequence, not vague descriptions
3. **Include element identifiers** — button text, CSS class, component name when visible
4. **Describe the expected vs actual** — don't just say "broken", explain the delta
5. **Suggest the fix location** — component name, file path, or code pattern if you can infer it
6. **Use consistent bug IDs** — so they can be tracked across runs
7. **Mark regressions** — if something passed before and now fails, say `REGRESSION from r{N}`
8. **Reference recording evidence** — mention recording timestamps and affected viewport when that context helps reproduce the issue

## Result JSON Format

The agent MUST also update `{workspace}/results/{taskId}.json`:

```json
{
  "status": "passed|failed",
  "startedAt": "ISO timestamp",
  "finishedAt": "ISO timestamp",
  "progress": 100,
  "passed": 18,
  "failed": 2,
  "warnings": 4,
  "lastLog": "Short summary — N pass, M fail, K warn",
  "findings": [
    {
      "id": "S0-B1",
      "severity": "P2",
      "module": "Products",
      "title": "Image upload fails silently",
      "description": "Full description with URL, steps, expected/actual",
      "createdAt": "2026-03-11T17:05:00.000Z"
    },
    {
      "id": "S0-W1",
      "severity": "WARNING",
      "module": "Dashboard",
      "title": "Mobile: 'Low stock items' text truncated to 'Low stock i'",
      "description": "At 375x812, the stat card truncates. URL: /en/admin/dashboard. Recording: 17:36 mobile viewport.",
      "viewport": "mobile",
      "createdAt": "2026-03-11T17:36:00.000Z"
    }
  ]
}
```

**Status logic:** `"passed"` if failed=0, `"failed"` if failed>0.

**IMPORTANT:**
- Both bugs AND warnings MUST be added to the `findings` array. Warnings use `"severity": "WARNING"` and should include a `"viewport"` field when they are responsive/layout issues.
- Every finding MUST include `"createdAt"` with an ISO timestamp of when you discovered it. The dashboard uses this to position the finding marker at the correct point in the recording timeline. Without it, findings cluster at the end instead of where they actually occurred.
- Add findings to the JSON **immediately when you discover them** (update the file incrementally), don't wait until the end of the run. This lets the dashboard show findings in real-time during recording playback.
