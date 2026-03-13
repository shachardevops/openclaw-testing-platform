# Agent Issues & Solutions

Track problems the QA agent encounters and how to handle them.

## 2026-03-09 — Task stuck as "running" after agent crash
- **Problem:** Agent process was killed but result file still said "running"
- **Impact:** Dashboard showed task as running forever, pipeline couldn't advance
- **Solution:** Dashboard now has 15-minute stale detection that auto-marks as failed
- **Prevention:** Always wrap the run in try/catch and write "failed" status on any error

## 2026-03-09 — Pipeline race condition on re-run
- **Problem:** Re-running a "passed" task didn't trigger pipeline advancement because status didn't change
- **Impact:** Pipeline stuck, no next task started
- **Solution:** Dashboard now writes "running" to result file BEFORE starting the agent
- **Prevention:** N/A — fixed in dashboard code

## 2026-03-10 — Data cleaned, many known bugs not verifiable
- **Problem:** Database was cleaned between runs; most entities (orders, shipments, intake, inventory, supplier orders, stones) have 0 items
- **Impact:** Cannot verify S0-B2 (intake breadcrumb UUID) or S0-W1 (duplicate supplier chips) — both require data to reproduce
- **Solution:** Accept as "not verifiable" in report; note in known-bugs.md
- **Prevention:** Before running QA after data clean, consider seeding minimum test data to cover known bug reproduction paths

## 2026-03-08 — Large inventory page slow load
- **Problem:** Inventory page with 578 items (29 pages) takes 3-5s to fully render
- **Impact:** Browser tool timed out trying to interact before table loaded
- **Solution:** Wait for table rows to appear before interacting with pagination
- **Prevention:** Always use wait_for_selector for data tables before interaction

## 2026-03-10 — Advanced Filters button click timeout (story-1)
- **Problem:** Browser tool ref-based click on "Advanced Filters" button timed out (8s). Succeeded when using JS `click()` directly.
- **Impact:** Had to use `evaluate` workaround to click the button
- **Solution:** Used `evaluate` with `document.querySelector` to find and click the button
- **Prevention:** For collapsible panels, consider using JS evaluate as fallback if ref-click times out

## 2026-03-10 — Cart sheet not opening via automated click (story-1)
- **Problem:** Clicking "Open Cart" button via browser ref didn't open the cart sheet. `data-state` stayed "closed".
- **Impact:** Could not test cart sheet contents, empty state, or checkout flow
- **Solution:** Inconclusive — could be real bug or browser automation artifact. Needs manual verification.
- **Prevention:** For Radix UI sheet components, try multiple click approaches. May need to check if component relies on specific mouse events (mousedown vs click)

## 2026-03-11 — Session collision: stale ref click on distributor page switches auth to admin (story-4)
- **Problem:** After logging in as distributor and taking a snapshot, clicking a checkbox ref on the report-sale page navigated to the admin inventory page, switching the session from distributor to admin.
- **Root cause:** Likely a stale ref from a prior admin snapshot was used; or the browser had overlapping auth states from rapid login/logout cycling.
- **Impact:** Had to re-login as distributor; all distributor data appeared consistent after re-login
- **Solution:** Use `document.querySelector('[role=checkbox]:not([aria-label="Select all"])')` via JS evaluate instead of ref-based clicks for row checkboxes in distributor portal. Always verify logged-in user via User Menu before acting.
- **Prevention:** Never use refs from a prior admin snapshot on a distributor page. Take fresh snapshot per page.

## 2026-03-11 — Login stall on r11 (story-5) — previous attempt
- **Problem:** Previous r11 attempt stalled on login. Agent kept waiting for redirect that never came.
- **Root cause:** Docker Desktop engine frozen — Supabase auth containers unreachable despite port 54451 being open (TCP handshake succeeds, HTTP requests timeout).
- **Impact:** Zero TCs could be executed; run marked as blocked/failed.
- **Diagnosis:** `curl http://127.0.0.1:54451/auth/v1/health` → timeout (exit 28). Docker socket API calls also timeout. `docker ps` hangs. Browser console shows `TypeError: Failed to fetch` from `signInWithPassword`.
- **Solution:** Restart Docker Desktop, then `supabase start` in the project directory.
- **Prevention:** Before starting QA runs, verify `curl http://127.0.0.1:54451/auth/v1/health` returns 200. Add a pre-flight check to the orchestrator.

## 2026-03-11 — Password hashes stale after Docker restart (story-5 r11)
- **Problem:** After Docker restart + `supabase start`, all user passwords were invalid. Auth returned 400 "invalid_credentials" even though users existed in `auth.users`.
- **Root cause:** The password hashes stored in the database didn't match the expected "password" input. Possibly the seed data used a different password or hashes were corrupted during Docker restart.
- **Diagnosis:** `docker exec supabase_db_ordertu psql -U postgres -c "SELECT crypt('password', encrypted_password) = encrypted_password AS match FROM auth.users WHERE email='test@example.com'"` returned `f` (false).
- **Solution:** Reset passwords via SQL: `UPDATE auth.users SET encrypted_password = crypt('password', gen_salt('bf')) WHERE email IN (...)`. All 5 users updated successfully.
- **Prevention:** After any Docker/Supabase restart, verify login works via `curl` before starting browser tests. Consider adding a seed verification step to the pre-flight check.

## 2026-03-11 — Thread creation dialog requires form.requestSubmit() (story-5 r11)
- **Problem:** Clicking "Create Thread" button via ref did not close the dialog or create the thread in supplier/buyer/distributor portals. The dialog remained open.
- **Root cause:** The button click via browser ref may not properly trigger the form submission event that React/Next.js expects.
- **Solution:** Used `form.requestSubmit()` via JS evaluate as fallback, which worked reliably.
- **Prevention:** For dialog forms, prefer `form.requestSubmit()` over button ref clicks.

## 2026-03-10 — Sign Out button non-functional via automated click (story-1)
- **Problem:** Clicking "Sign Out" button did not redirect to login page. Session remained active.
- **Impact:** Could not verify sign-out clears session properly
- **Solution:** Inconclusive — needs manual verification
- **Prevention:** If sign-out uses Supabase `signOut()` which is async, the redirect may happen after a delay or via navigation that the automated browser doesn't capture

## 2026-03-11 — Admin vs non-admin password discrepancy (story-11 r1)
- **Problem:** Admin user (test@example.com) uses password "121212" while buyer/supplier/distributor use "password" (reset during story-5 Docker restart fix).
- **Impact:** Had to track two different passwords during multi-portal testing.
- **Solution:** Check password with `curl` API before attempting browser login.
- **Prevention:** Standardize all test user passwords after any password reset operation.

## 2026-03-11 — Login form requires requestSubmit() for cross-session login (story-11 r1)
- **Problem:** Filling email/password via `nativeInputValueSetter` and clicking Login button doesn't always trigger navigation. Using `form.requestSubmit()` after a 200ms delay is more reliable.
- **Solution:** Use JS evaluate with `nativeInputValueSetter` + `form.requestSubmit()` for login flows.
- **Prevention:** Always use `form.requestSubmit()` as the form submission method for login forms.

## 2026-03-11 — Viewport resize breaks prior refs (story-6 r5)
- **Problem:** After resizing viewport from desktop to mobile (375x812) using `kind: resize`, all prior refs become invalid (new ref IDs assigned after re-render). Clicking a ref from a desktop snapshot at a mobile viewport causes a timeout.
- **Impact:** Had to take fresh snapshots after every resize before interacting with elements.
- **Solution:** Always snapshot immediately after resize before attempting any element interactions.
- **Prevention:** Treat viewport resize like a page navigation — never use stale refs across viewport changes.

## 2026-03-11 — page scroll via documentElement.scrollTop returns value but screenshot unchanged (story-6 r5)
- **Problem:** `document.documentElement.scrollTop = 1500` returns 1500 (indicating the assignment was accepted), but the screenshot still shows the same viewport — the page didn't visually scroll.
- **Root cause:** The app uses a CSS overflow container (e.g., `main` element with `overflow-y: auto`) rather than body-level scrolling. Setting `documentElement.scrollTop` has no effect.
- **Solution:** For apps with custom scroll containers, use the `main` element: `document.querySelector('main').scrollTo(0, Y)` or use the accessibility tree snapshot to verify content is present in the DOM rather than relying on screenshot position.
- **Prevention:** Always check which element has the scroll container. Use snapshot tree to verify content presence instead of pixel position.

## 2026-03-11 — Supplier run intermittently bounces between supplier/admin/login contexts (story-12 r1)
- **Problem:** After successful supplier login, clicking supplier action-item/order links intermittently timed out and/or redirected to `/en/auth/login` or admin routes.
- **Impact:** Could not execute the full supplier workflow in one uninterrupted flow; run finalized with functional failure.
- **Solution:** Worked around partially by re-authenticating and continuing with direct navigation, but instability persisted.
- **Prevention:** For cross-portal stories, isolate by explicit sign-out before role switch and re-snapshot after each redirect; app side should harden role-route/session consistency.

## 2026-03-11 — Model swap mid-run (story-12 r2)
- **Problem:** API error during story-12 run triggered model swap from claude-opus-4-6 to gpt-5.3-codex mid-execution.
- **Impact:** Minimal — run continued from checkpoint without losing state. Browser tab stayed active.
- **Solution:** Continued from where left off (mobile responsive checks → tablet checks → report writing).
- **Prevention:** No action needed; model swap protocol worked correctly.

## 2026-03-11 — Hebrew locale navigation causes session redirect (story-12 r2)
- **Problem:** After visiting `/he/admin/supplier-orders/new`, navigating back to English admin routes caused session to redirect to `/en/supplier` (supplier portal) or lose admin context.
- **Impact:** Had to re-login to continue admin testing at tablet viewport.
- **Solution:** Re-authenticate after locale switch and before viewport resize.
- **Prevention:** Avoid rapid locale switching during responsive testing. Test Hebrew locale as a separate pass after completing English viewport tests.

## story-13 run (2026-03-12)
- **Browser tab closure mid-run:** Tab closed unexpectedly during tablet inventory test (gateway timeout). Sufficient coverage was obtained; wrote report with available data.
- **Resize persistence:** Viewport resize (act kind=resize) does not persist when tab closes and new tab opens — new tabs default to 375x812 (the last mobile resize). Must call resize explicitly on every new tab.
- **Auth session in new tab:** Auth session from previous tab carries over if opening the same origin (logged-in cookies preserved). No re-login needed when browser restarts within same session.
- **Story-13 scope:** No explicit story definition found in any config file. Determined scope from context: follows story-12 (Admin Supplier Orders), covers Supplier Portal UX. Future runs should document story scope in a `stories-config.json` or similar.

## 2026-03-12 — Story-15 has no pipeline config entry
- **Problem:** story-15 was requested but has no formal definition in pipeline-config.json. Stories only go up to story-11 in the config.
- **Impact:** No formal test plan to reference. Agent must infer scope from context.
- **Solution:** Scoped as "Settings & Admin Tools" (untested modules: Metals, Automations, Activity Log, Trash) + all user/location management modules + comprehensive responsive passes.
- **Note for future:** When story-15 (or any story above story-11) is requested, treat as an ad-hoc QA pass covering gaps from prior stories.

## 2026-03-12 — Semi-mounts URL is /assembly-orders not /assembly
- **Problem:** Navigating to `/en/admin/semi-mounts/assembly` returns 404.
- **Solution:** Correct URL is `/en/admin/semi-mounts/assembly-orders`. Always check sidebar link href before navigating.
- **Correct routes:**
  - Assembly: `/en/admin/semi-mounts/assembly-orders`
  - Rings: `/en/admin/semi-mounts/rings`
  - Crowns: `/en/admin/semi-mounts/crowns`

## 2026-03-12 — Mobile nav drawer scroll check
- **Method to verify:** After opening the mobile nav drawer, use DOM evaluation to get `top` values for the last few nav items (Automations, Activity Log, Trash). If any are > viewport height (812px), they're unreachable.
- **Confirmed:** At 375x812, Activity Log (841px) and Trash (881px) are unreachable.
- **Check command:** `Array.from(document.querySelectorAll('a')).filter(a => a.href.match(/automation|activity|trash/)).map(a => ({text: a.textContent.trim(), top: Math.round(a.getBoundingClientRect().top)}))`
