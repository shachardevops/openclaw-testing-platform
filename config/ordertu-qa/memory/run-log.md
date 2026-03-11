# Run Log

| Run | Story | Date | Model | Result | Pass | Fail | Warn | Notes |
|-----|-------|------|-------|--------|------|------|------|-------|
| r5 | story-0 | 2026-03-08 | sonnet | passed | 15 | 0 | 3 | Baseline before data import |
| r6 | story-0 | 2026-03-09 | opus | passed | 18 | 0 | 4 | Large data import (578 items, 333 products) |
| r7 | story-0 | 2026-03-09 | openai-codex/gpt-5.3-codex | failed | 7 | 2 | 0 | Continuation run from products/intake; new blocker S0-B7 (product code route -> 500), S0-B2 persists |
| -- | system | 2026-03-10 | -- | clean | -- | -- | -- | clean-all-tasks (14 tasks cleared) at 10:32 GMT+2 |
| -- | unknown | 2026-03-10 | claude-sonnet-4-6 | failed | 0 | 0 | 0 | Session killed by session manager at ~10:40 GMT+2; session dd2a8c4e-fe34 |
| orch | triage | 2026-03-10 | orchestrator | assessed | -- | -- | -- | Orchestrator spawned at 10:50 GMT+2; platform idle, no stuck sessions |
| r8 | story-0 | 2026-03-10 | claude-opus-4-6 | failed | 22 | 3 | 2 | Data cleaned; S0-B7 FIXED; 3 new bugs (S0-B8 P4 locations placeholder, S0-B9 P3 i18n greeting, S0-B10 P3 i18n "In Stock"); S0-B2/S0-W1 not verifiable (no data) |
| r9 | story-1 | 2026-03-10 | claude-opus-4-6 | failed | 28 | 4 | 7 | Buyer portal; P1 blocker: PDP 404 for existing product (S1-B1); 3 i18n bugs (S1-B2/B3/B4); many flows blocked by PDP 404 + only 1 product with 0 stock |
| r10 | story-4 | 2026-03-11 | claude-sonnet-4-6 | passed | 30 | 2 | 2 | Distributor sells & returns; consignment SHP-202603-00001 created; sale reported; 2 bugs: S4-B1 catalog PDP 404 (same as S1-B1), S4-B2 create-order route missing (→ redirects admin); inbox messaging works |
| r11 | story-5 | 2026-03-11 | claude-opus-4-6 | passed | 17 | 0 | 2 | Cross-portal threads; password hashes were stale after Docker restart (reset via SQL). Thread visibility is participant-scoped (admin sees all, others see own only). S5-W3 FIXED (Distributor role tab). S5-W2 PERSISTS (buyer Resolve button). New warning S5-W4 (admin threads not visible to supplier — by-design question). |
| r5 | story-6 | 2026-03-11 | claude-sonnet-4-6 | passed | 79 | 0 | 3 | Full run + mobile/responsive. W1 FIXED (card empty state). W3 FIXED (stale data flash). W2 PERSISTS (broken product images). New: S6-W4 (activity log no real-time refresh), S6-W5 (tablet payment text overlap). |
| r3 | story-7 | 2026-03-11 | claude-opus-4-6 | passed | 32 | 0 | 5 | Full inventory lifecycle. 578 items, 1 Reserved. 2 new P4 bugs (S7-B1 filter dialog placeholder, S7-B2 empty state placeholder). 3 warnings persist from r2 (intake UUID, side stones out-of-stock, movement ref IDs). Stock count verified with scan. |
