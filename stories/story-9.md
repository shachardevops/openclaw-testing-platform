# QA Report — Story 9: Semi Mount Assembly Order E2E
**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

---

## Executive Summary

Run 7 validates the full Semi Mount Assembly Order end-to-end flow after all fixes from runs 2-6. All three critical bugs from r2 are confirmed fixed: ring base matching (fix #79), form validation (fix #117), and view navigation (fix #80). New features added since r2 — crown and ring detail pages with server-side paginated tables (fix #81/#82), centralized query keys (fix #116), translated strings (fix #114/#115), and auto-refresh on completion (fix #74) — all pass. No failures. Two low-severity warnings remain.

---

## Test Results

### 1. Navigation & Catalog Pages

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1.1 | Assembly sidebar link navigates to `/semi-mounts/assembly-orders` | **PASS** | Renders list or empty state correctly |
| 1.2 | Rings sidebar link loads Ring Bases table | **PASS** | All ring rows visible |
| 1.3 | Rings table columns: Model ID, Size Segment, Metal, CAD, On Hand, Reserved, Available, Status | **PASS** | All columns present |
| 1.4 | Crowns sidebar link loads Crown Models table | **PASS** | All crown rows visible |
| 1.5 | Crowns table columns: Model ID, Type, Metal, Shape, Carat Range, CAD, On Hand, Reserved, Available, Status | **PASS** | All columns present |
| 1.6 | "New assembly order" button on Assembly Orders page | **PASS** | Top-right CTA navigates to `/assembly-orders/new` |
| 1.7 | "New assembly order" button on Rings page | **PASS** | Same navigation target |
| 1.8 | "New assembly order" button on Crowns page | **PASS** | Same navigation target |

---

### 2. Rings List Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 2.1 | Model ID column | **PASS** | SM-RB-XXX format |
| 2.2 | Size Segment column | **PASS** | SM, MD, LG values shown |
| 2.3 | Metal column | **PASS** | 18K WG, 18K YG, etc. |
| 2.4 | CAD images column | **PASS** | Image thumbnails or upload placeholder |
| 2.5 | On Hand / Reserved / Available columns | **PASS** | Integer counts, correct totals |
| 2.6 | Status column | **PASS** | Active/Inactive badges |
| 2.7 | Search functionality | **PASS** | fix #34 — search filters by model ID and metal |
| 2.8 | Filter functionality | **PASS** | fix #34 — TanStack Table filters working |
| 2.9 | Row click navigates to detail page | **PASS** | fix #81 — click navigates to `/rings/[id]` detail |

---

### 3. Crowns List Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 3.1 | Model ID column | **PASS** | SM-CR-XXX format |
| 3.2 | Type / Metal / Shape / Carat Range columns | **PASS** | All crown-specific fields displayed |
| 3.3 | CAD gallery column | **PASS** | Image gallery with view/upload actions |
| 3.4 | On Hand / Reserved / Available columns | **PASS** | Correct inventory counts |
| 3.5 | Status column | **PASS** | Active/Inactive badges |
| 3.6 | Search functionality | **PASS** | fix #34 — search by model ID |
| 3.7 | Row click navigates to detail page | **PASS** | fix #81 — click navigates to `/crowns/[id]` detail |

---

### 4. Crown Detail Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 4.1 | Page loads at `/en/admin/semi-mounts/crowns/[id]` | **PASS** | fix #81 — full detail page renders |
| 4.2 | Header shows model_id, type, metal, shape, carat range | **PASS** | All crown spec fields in header |
| 4.3 | CAD images gallery | **PASS** | Gallery with navigation arrows (RTL-safe with `rtl:rotate-180`) |
| 4.4 | Inventory summary counts | **PASS** | On Hand, Reserved, Available from `_inventory_counts` view |
| 4.5 | Physical pieces table | **PASS** | Individual inventory items listed with DN codes, status |
| 4.6 | Physical pieces pagination | **PASS** | fix #82 — server-side pagination, 10 per page, `keepPreviousData` transitions |
| 4.7 | Assembly history table | **PASS** | Past assembly orders using this crown model |
| 4.8 | Assembly history pagination | **PASS** | fix #82 — server-side pagination, 10 per page |

---

### 5. Ring Detail Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 5.1 | Page loads at `/en/admin/semi-mounts/rings/[id]` | **PASS** | fix #81 — full detail page renders |
| 5.2 | Header shows model_id, size_segment, metal | **PASS** | Ring-specific fields in header |
| 5.3 | CAD images gallery | **PASS** | Same gallery component as crowns |
| 5.4 | Inventory summary counts | **PASS** | On Hand, Reserved, Available |
| 5.5 | Physical pieces table with pagination | **PASS** | fix #82 — paginated inventory items |
| 5.6 | Assembly history table with pagination | **PASS** | fix #82 — paginated history |

---

### 6. New Assembly Form — Step 1: Product Selection

| # | Test | Result | Notes |
|---|------|--------|-------|
| 6.1 | Form loads at `/semi-mounts/assembly-orders/new` | **PASS** | Multi-step form renders |
| 6.2 | Product combobox opens searchable dialog | **PASS** | Dialog with product search |
| 6.3 | Select product (e.g., "Semi Mount Demo Ring") | **PASS** | Product name and code shown in Step 1 card |

---

### 7. New Assembly Form — Step 2: Configuration

| # | Test | Result | Notes |
|---|------|--------|-------|
| 7.1 | Metal Type dropdown with 6 options | **PASS** | 14K YG, 14K WG, 14K RG, 18K YG, 18K WG, PT950 |
| 7.2 | Center Stone Carat dropdown with 19 options | **PASS** | 0.5ct through 10ct, full range |
| 7.3 | Size segment label shown inline | **PASS** | "Size segment: SM" appears next to carat selection |
| 7.4 | Ring Size is optional | **PASS** | Form proceeds without ring size |
| 7.5 | Step 3 appears only after product + carat selected | **PASS** | Correct lazy rendering behavior |

---

### 8. Ring Base Bug Fix Verification

| # | Test | Result | Notes |
|---|------|--------|-------|
| 8.1 | 1ct carat maps to "Size segment: SM" in UI | **PASS** | `caratToSizeSegment(1)` returns SM |
| 8.2 | Server-side `mapCaratToSegment(1)` returns SM | **PASS** | fix #79 — changed `carat < 1` to `carat <= 1` |
| 8.3 | Ring Base auto-suggested: SM-RB-001 (SM, not MD) | **PASS** | fix #79 confirmed — correct ring base for 1ct |
| 8.4 | SM-RB-002 (MD) NOT suggested for 1ct | **PASS** | MD ring correctly excluded |

---

### 9. New Assembly Form — Step 3: Component Selection

| # | Test | Result | Notes |
|---|------|--------|-------|
| 9.1 | Crown Model section shows matching crown(s) | **PASS** | Correct carat-range match |
| 9.2 | Crown stock count displayed | **PASS** | "In Stock (N)" badge accurate |
| 9.3 | Crown inventory items listed | **PASS** | Individual SM-coded pieces shown |
| 9.4 | Ring Base section shows matching ring(s) | **PASS** | Correct size segment match |
| 9.5 | Ring stock count displayed | **PASS** | "In Stock (N)" badge accurate |
| 9.6 | Ring inventory items listed | **PASS** | Individual SM-coded pieces shown |
| 9.7 | "Create Assembly Order" disabled until both items selected | **PASS** | Correct validation — requires crown + ring selection |
| 9.8 | Select crown item highlights it | **PASS** | Visual selection indicator |
| 9.9 | Select ring item enables submit button | **PASS** | Button becomes active with both selections |

---

### 10. Order Creation

| # | Test | Result | Notes |
|---|------|--------|-------|
| 10.1 | Submit creates order | **PASS** | No errors, server action succeeds |
| 10.2 | Redirect to Assembly Orders list | **PASS** | List page renders after creation |
| 10.3 | New order appears with order number | **PASS** | SM-XXXXXXXX-XXXX format |
| 10.4 | Status shows "Pending" | **PASS** | Correct initial status |

---

### 11. Assembly Orders List

| # | Test | Result | Notes |
|---|------|--------|-------|
| 11.1 | List uses `useQuery` with `initialData` | **PASS** | fix #117 — replaces frozen `useState(initialOrders)` |
| 11.2 | Row clickable, navigates to detail | **PASS** | fix #80 — click navigates to detail page |
| 11.3 | Navigation uses absolute path | **PASS** | fix #80 — `/${locale}/admin/semi-mounts/assembly-orders/${id}`, no doubled segments |
| 11.4 | Order number, product, metal, status columns | **PASS** | All columns render correctly |
| 11.5 | Created At timestamp | **PASS** | Locale-aware date formatting |

---

### 12. Order Detail Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 12.1 | Detail page loads at `/assembly-orders/{uuid}` | **PASS** | Full detail renders |
| 12.2 | Order Items table | **PASS** | Product code, metal, status displayed |
| 12.3 | Semi Mount Pieces table | **PASS** | Crown + Ring pieces with "Reserved" status |
| 12.4 | "Mark as Finished" button visible | **PASS** | Primary action for Pending orders |
| 12.5 | "Cancel Order" button visible | **PASS** | Secondary action available |
| 12.6 | "Back to orders" link works | **PASS** | Returns to list |

---

### 13. Mark as Finished

| # | Test | Result | Notes |
|---|------|--------|-------|
| 13.1 | Dialog opens with form fields | **PASS** | Modal renders correctly |
| 13.2 | Destination Location required | **PASS** | Button disabled until location selected |
| 13.3 | DN Number optional | **PASS** | Form submits without DN |
| 13.4 | Certificate Number optional | **PASS** | Form submits without certificate |
| 13.5 | Cost/Selling Price optional | **PASS** | Form submits without prices |
| 13.6 | Submit completes order | **PASS** | Status transitions to "Completed" |
| 13.7 | Crown piece status -> "Used In Assembly" | **PASS** | Piece status updated |
| 13.8 | Ring piece status -> "Used In Assembly" | **PASS** | Piece status updated |
| 13.9 | "Output Products" section appears | **PASS** | New inventory item listed with IV code |

---

### 14. Output Inventory Item

| # | Test | Result | Notes |
|---|------|--------|-------|
| 14.1 | Output item links to `/inventory/{uuid}` | **PASS** | External link navigates correctly |
| 14.2 | Status: Available | **PASS** | Green badge on inventory detail |
| 14.3 | Correct product association | **PASS** | Product name and code match assembly order |
| 14.4 | Correct location | **PASS** | Matches destination selected in completion dialog |
| 14.5 | Traceability note | **PASS** | "Assembled via semi mount order SM-XXXXXXXX-XXXX" |

---

### 15. Post-Assembly Inventory Count

| # | Test | Result | Notes |
|---|------|--------|-------|
| 15.1 | Ring On Hand decremented | **PASS** | Count reduced by 1 |
| 15.2 | Ring Available decremented | **PASS** | Count reduced by 1 |
| 15.3 | Crown On Hand decremented | **PASS** | Count reduced by 1 |
| 15.4 | Crown Available decremented | **PASS** | Count reduced by 1 |

---

### 16. Auto-Refresh After Completion

| # | Test | Result | Notes |
|---|------|--------|-------|
| 16.1 | Detail page updates without manual refresh | **PASS** | fix #74 — `useQuery` with `initialData` replaces frozen `useState` |
| 16.2 | Status badge updates immediately | **PASS** | "Completed" shown after `handleSuccess` invalidates query |
| 16.3 | Action buttons removed for Completed order | **PASS** | Only "Back to orders" remains |

---

### 17. Cancel Order

| # | Test | Result | Notes |
|---|------|--------|-------|
| 17.1 | Cancel action available for Pending orders | **PASS** | Button visible |
| 17.2 | Status transitions to "Cancelled" | **PASS** | Badge updates |
| 17.3 | Reserved pieces released | **PASS** | Crown and ring pieces return to "Available" |

---

### 18. Hardcoded Strings Translated

| # | Test | Result | Notes |
|---|------|--------|-------|
| 18.1 | "Created" uses `t()` | **PASS** | fix #114 — no hardcoded English on detail page |
| 18.2 | "Last Updated" uses `t()` | **PASS** | fix #114 |
| 18.3 | "Notes" uses `t()` | **PASS** | fix #114 |
| 18.4 | "Type", "Item ID", "Product", "Location", "Status" use `t()` | **PASS** | fix #114 — all table headers translated |
| 18.5 | "Output Products" uses `t()` | **PASS** | fix #114 |

---

### 19. Locale-Aware Dates

| # | Test | Result | Notes |
|---|------|--------|-------|
| 19.1 | Created/Updated dates use `Intl.DateTimeFormat` | **PASS** | fix #114 — replaced `date-fns format()` with locale-aware formatting |
| 19.2 | Date format respects locale | **PASS** | English and Hebrew render dates in their respective formats |

---

### 20. CAD Image Column Translations

| # | Test | Result | Notes |
|---|------|--------|-------|
| 20.1 | "View CAD image(s)" title translated | **PASS** | fix #115 — uses `t("semiMount.viewCadImages")` |
| 20.2 | "Upload CAD image" title translated | **PASS** | fix #115 — uses `t("semiMount.uploadCadImage")` |
| 20.3 | Translations in both crowns and rings columns | **PASS** | Both `crowns-columns.tsx` and `rings-columns.tsx` updated |

---

### 21. Query Keys Centralized

| # | Test | Result | Notes |
|---|------|--------|-------|
| 21.1 | `semiMountAssemblyOrders` in `queryKeys` factory | **PASS** | fix #116 — added to `query-keys.ts` |
| 21.2 | List component uses `queryKeys.semiMountAssemblyOrders.all` | **PASS** | fix #116 — no hardcoded arrays |
| 21.3 | Detail component uses `queryKeys.semiMountAssemblyOrders.detail(id)` | **PASS** | fix #116 — consistent key structure |

---

## Previous Bugs — Status

| Bug | Description | Status |
|-----|-------------|--------|
| BUG-1 (r2) | Ring base matched wrong size (MD for 1ct instead of SM) | FIXED — fix #79 |
| BUG-2 (r2) | Form could submit without selecting inventory items | FIXED — fix #117 |
| BUG-3 (r2) | No size segment label in configuration step | FIXED |
| W4 (r2) | Assembly orders list rows not clickable | FIXED — fix #80 |

---

## Warnings

| ID | Observation | Severity |
|----|-------------|----------|
| W-1 | Supabase Realtime WebSocket connections return 502 in dev — no impact on REST functionality | Low |
| W-2 | Multiple product images returning 404 from `media.valigara.com` CDN (test/seed data has stale image URLs) | Low |

---

## Fix Verification Summary

| Fix # | Description | Verified |
|-------|-------------|----------|
| #34 | Search/filter on semi-mount lists | PASS |
| #74 | Auto-refresh after completion (useQuery replaces useState) | PASS |
| #79 | Ring base matching for 1ct (SM not MD) | PASS |
| #80 | View Order absolute path navigation | PASS |
| #81 | Crown & Ring detail pages | PASS |
| #82 | Server-side pagination for inventory & history tables | PASS |
| #114 | Hardcoded strings translated, locale-aware dates | PASS |
| #115 | CAD image column translations | PASS |
| #116 | Query keys centralized in factory | PASS |
| #117 | useQuery with initialData on assembly orders list | PASS |

---

## Test Coverage Summary

| Section | Tests Run | Pass | Fail | Warn |
|---------|-----------|------|------|------|
| Navigation & Catalog | 8 | 8 | 0 | 0 |
| Rings List Page | 9 | 9 | 0 | 0 |
| Crowns List Page | 7 | 7 | 0 | 0 |
| Crown Detail Page | 8 | 8 | 0 | 0 |
| Ring Detail Page | 6 | 6 | 0 | 0 |
| Form Step 1: Product | 3 | 3 | 0 | 0 |
| Form Step 2: Config | 5 | 5 | 0 | 0 |
| Ring Base Bug Fix | 4 | 4 | 0 | 0 |
| Form Step 3: Components | 9 | 9 | 0 | 0 |
| Order Creation | 4 | 4 | 0 | 0 |
| Assembly Orders List | 5 | 5 | 0 | 0 |
| Order Detail Page | 6 | 6 | 0 | 0 |
| Mark as Finished | 9 | 9 | 0 | 0 |
| Output Inventory Item | 5 | 5 | 0 | 0 |
| Post-Assembly Inventory | 4 | 4 | 0 | 0 |
| Auto-Refresh | 3 | 3 | 0 | 0 |
| Cancel Order | 3 | 3 | 0 | 0 |
| Hardcoded Strings | 5 | 5 | 0 | 0 |
| Locale-Aware Dates | 2 | 2 | 0 | 0 |
| CAD Image Translations | 3 | 3 | 0 | 0 |
| Query Keys Centralized | 3 | 3 | 0 | 0 |
| **TOTAL** | **111** | **111** | **0** | **0** |

> 2 low-severity warnings (dev infrastructure / seed data) not counted as failures.

---

SUMMARY: Passed: 111 | Failed: 0 | Warnings: 2
