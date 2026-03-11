# Pre-Run Checklist

Before starting any story run, the QA agent MUST verify these conditions. Skip the run and report failure if any blocker condition is not met.

## Environment Checks

1. **App is running** — Navigate to the base URL (http://localhost:3000) and verify the page loads
2. **Login works** — Verify the expected portal (admin/buyer/supplier/distributor) is accessible
3. **No crash on load** — Check browser console for critical errors (red errors, not warnings)
4. **Previous story dependencies** — If this story has deps, check their result files exist and show passed/failed (not "running" or missing)
5. **Viewport plan** — If Responsive or Mobile add-on is enabled, plan the required breakpoint and phone-sized coverage before starting the run

## Data State Awareness

1. **Read the previous report** — Check `{workspace}/reports-md/{taskId}.md` from the last run
2. **Note persisted bugs** — Any bug from previous run that's still present should be tagged `PERSISTS`
3. **Note data changes** — If product count, inventory count, or order count changed significantly since last run, mention it in the report scope
4. **Check for test data** — Some stories create test data (orders, shipments). Note if this data already exists to avoid confusion

## Result File Protocol

1. **Write "running" immediately** — Before doing anything else:
   ```json
   {"status":"running","startedAt":"...","progress":0,"lastLog":"Starting..."}
   ```
2. **Update progress periodically** — Every 2-3 modules tested, update progress (0-100) and lastLog
3. **Write final result** — When done, write complete result with findings array
4. **Never leave "running"** — If you crash or get cancelled, the dashboard has a 15-minute stale detector, but try to write "failed" on any error

## Report Writing Protocol

1. **Follow output-format.md exactly** — The format is not optional
2. **Be specific about locations** — URL paths, button labels, component sections
3. **Test with real interactions** — Click buttons, fill forms, submit — don't just check if elements exist
4. **Recording-aware descriptions** — Describe what you see: element positions, text content, viewport, colors, error messages, and recording timing when useful
5. **Check console errors** — Report any JS errors thrown during interactions
6. **Test navigation** — Breadcrumbs, back button, sidebar links
7. **Test empty states** — What happens when a list has no items
8. **Test pagination** — If more than 20 items, verify page controls work
9. **Test i18n** — Check for untranslated strings, mixed LTR/RTL
10. **Test mobile responsiveness when enabled** — After EVERY page navigation in mobile viewport, stop and visually inspect the rendered page. Look for truncated text, crammed labels, off-screen content, overlapping elements, and tiny touch targets. Report each issue as a separate WARNING finding with viewport size, URL, and recording timestamp. Do not skip cosmetic issues.

## Known Gotchas to Watch For

- **Supplier chip in orders** — Sometimes shows "Not selected" even after selecting
- **Breadcrumb UUIDs** — Some detail pages show raw UUID instead of display name
- **DN search** — Inventory search by DN code may return no results despite items existing
- **Pagination edge cases** — Going to last page and back can sometimes reset filters
- **RTL text mixing** — Hebrew text mixed with English in some forms
