# QA Report — Story 8: Shipments Module
**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

---

## Executive Summary

Run 7 validates the full Shipments module after all fixes from runs 3-6 have been applied. The critical F-8 regression (`ReferenceError: t is not defined` in `UnifiedItemSelector`) is now **fixed** (fix #91). Status filter URL param handling is fixed (#76), list auto-refresh after Ship/Deliver actions works (#77), total items column shows integers (#78), and the edit breadcrumb correctly shows the shipment number (#76). One known gap remains (IV-prefix barcode — by design). Two warnings carry forward: the "Mark as Delivered" dialog subtitle shows a raw i18n key (W-3), and the button label differs between table and card view (W-4).

---

## Test Results

### 1. Shipments List

| # | Test | Result | Notes |
|---|------|--------|-------|
| 1.1 | Navigate to `/en/admin/shipments` | **PASS** | Page loads correctly with breadcrumb `Dashboard > Shipments` |
| 1.2 | All columns visible | **PASS** | Shipment #, Date, From, To, Type, Items, Status, Delivered At, Actions |
| 1.3 | Shipment data loads | **PASS** | Shipment rows render with correct data (SHP-prefixed numbers) |
| 1.4 | Pagination present | **PASS** | Page N of N shown, row selection count displayed |
| 1.5 | "0 of N row(s) selected" text | **PASS** | Selection counter correct |

---

### 2. Table/Card View Toggle

| # | Test | Result | Notes |
|---|------|--------|-------|
| 2.1 | Table view renders by default | **PASS** | Full table with all columns |
| 2.2 | Switch to Card view | **PASS** | Cards render with shipment number, status badge, item count, date, location route |
| 2.3 | Switch back to Table view | **PASS** | Table re-renders correctly |
| 2.4 | Button label consistency | **WARN** | Table view shows "Add Shipment" but Card view shows "Create Shipment" — same action, inconsistent label (W-4) |

---

### 3. Status Filter

| # | Test | Result | Notes |
|---|------|--------|-------|
| 3.1 | Filter dialog opens | **PASS** | Filters button opens dialog with Status dropdown |
| 3.2 | All status options present | **PASS** | Draft, Pending, Preparing, Packed, In Transit, In Customs, Delivered, Confirmed, Cancelled, Returned — all 10 present |
| 3.3 | Filter by Status = In Transit | **PASS** | Table filters correctly, "Filters 1" badge shown (fix #22/#76 confirmed) |
| 3.4 | Filter by Status = Delivered | **PASS** | Correct rows shown |
| 3.5 | Clear filter | **PASS** | All rows restored |
| 3.6 | URL param `status` applied on page load | **PASS** | fix #76 — `status` param now recognized by `getShipments()` |

---

### 4. Search

| # | Test | Result | Notes |
|---|------|--------|-------|
| 4.1 | Search by shipment number | **PASS** | Typing partial SHP number filters results live |
| 4.2 | Search for non-existent number | **PASS** | Returns empty state with "No results found" |
| 4.3 | Clear search restores full list | **PASS** | All shipments return |

---

### 5. New Shipment Form

| # | Test | Result | Notes |
|---|------|--------|-------|
| 5.1 | "Add Shipment" navigates to `/en/admin/shipments/new` | **PASS** | Form loads |
| 5.2 | Breadcrumb shows `Dashboard > Shipments > Create` | **PASS** | Correct breadcrumb trail |
| 5.3 | Form fields present: Date, Type, From Location, To Location, Tracking Number, Carrier, Notes | **PASS** | All fields rendered |
| 5.4 | To Location disabled until From Location selected | **PASS** | Correct conditional enable behavior |
| 5.5 | "Create Shipment" button disabled initially | **PASS** | Prevents empty submission |

---

### 6. Item Selection (UnifiedItemSelector)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 6.1 | Item selector hidden until From Location selected | **PASS** | By design — appears only after location chosen |
| 6.2 | Selecting From Location renders UnifiedItemSelector | **PASS** | fix #91 confirmed — no `ReferenceError: t is not defined` crash |
| 6.3 | Tabs present: Items, Materials, Metals | **PASS** | All three tabs rendered |
| 6.4 | Items tab shows inventory from selected location | **PASS** | DN-coded items listed with product info |
| 6.5 | Item search/scan input | **PASS** | Search field with barcode scan placeholder |
| 6.6 | Add item via "+" button | **PASS** | Item added to shipment items list |
| 6.7 | Remove item | **PASS** | Item removed from shipment items list |

---

### 7. Material Tracking in Shipments

| # | Test | Result | Notes |
|---|------|--------|-------|
| 7.1 | Materials tab accessible | **PASS** | Shows side stone quantities |
| 7.2 | Metals tab accessible | **PASS** | Shows gold/platinum weight inputs |
| 7.3 | Gold weight entry | **PASS** | Accepts numeric input for gold grams |
| 7.4 | Platinum weight entry | **PASS** | Accepts numeric input for platinum grams |
| 7.5 | Side stone quantity entry | **PASS** | Accepts carat quantity |

---

### 8. Create Shipment

| # | Test | Result | Notes |
|---|------|--------|-------|
| 8.1 | Fill all required fields and add item(s) | **PASS** | Form validates correctly |
| 8.2 | Submit creates shipment | **PASS** | Toast: "Shipment created successfully" |
| 8.3 | Redirects to shipment detail page | **PASS** | Detail page renders with new shipment data |

---

### 9. Shipment Detail Page

| # | Test | Result | Notes |
|---|------|--------|-------|
| 9.1 | Breadcrumb shows `Dashboard > Shipments > SHP-XXXXXX-XXXXX` | **PASS** | Shipment number in breadcrumb, not UUID |
| 9.2 | Progress bar renders | **PASS** | Shows shipment lifecycle stages with timestamps |
| 9.3 | Items table lists shipment items | **PASS** | DN codes, product names, prices, statuses |
| 9.4 | From/To locations displayed | **PASS** | Correct origin and destination |
| 9.5 | Tracking number shown | **PASS** | Tracking info visible |
| 9.6 | Print button present | **PASS** | Triggers print functionality |
| 9.7 | Documents & Discussions section | **PASS** | Thread section loads with Open/Resolved tabs |

---

### 10. Quick Actions: Ship (Pending to In Transit)

| # | Test | Result | Notes |
|---|------|--------|-------|
| 10.1 | "Ship" action available for Pending shipments | **PASS** | Button/dropdown action visible |
| 10.2 | Confirmation dialog appears | **PASS** | "Are you sure?" dialog |
| 10.3 | Confirm transitions status to In Transit | **PASS** | Status badge updates |
| 10.4 | List auto-refreshes without page reload | **PASS** | fix #77 — `refetchType: "all"` forces immediate refetch |

---

### 11. Quick Actions: Mark as Delivered

| # | Test | Result | Notes |
|---|------|--------|-------|
| 11.1 | "Mark as Delivered" available for In Transit shipments | **PASS** | Action visible in list |
| 11.2 | Confirmation dialog appears | **PASS** | Dialog with confirm/cancel buttons |
| 11.3 | Confirm transitions status to Delivered | **PASS** | Status updates to "Delivered" |
| 11.4 | "Delivered At" column populated | **PASS** | Date appears in the column |
| 11.5 | List auto-refreshes | **PASS** | fix #77 confirmed — no stale data |

---

### 12. Mark as Delivered Dialog Text

| # | Test | Result | Notes |
|---|------|--------|-------|
| 12.1 | Dialog title renders properly | **PASS** | Human-readable title |
| 12.2 | Dialog subtitle/description | **WARN** | Subtitle shows `Confirm Deliver Description` — raw i18n key, not translated text (W-3) |

---

### 13. Edit Shipment

| # | Test | Result | Notes |
|---|------|--------|-------|
| 13.1 | Edit available only for Pending/Preparing/Packed shipments | **PASS** | Delivered/In Transit shipments redirect to detail |
| 13.2 | Edit form pre-fills existing data | **PASS** | All fields populated with current values |
| 13.3 | Breadcrumb shows `Dashboard > Shipments > SHP-XXXXXX-XXXXX > Edit` | **PASS** | fix #76 — shipment number shown, not UUID |
| 13.4 | Save updates shipment | **PASS** | Changes persisted correctly |

---

### 14. Total Items Column

| # | Test | Result | Notes |
|---|------|--------|-------|
| 14.1 | Total items shows integer | **PASS** | fix #78 — displays `1` not `1.00`, `decimals: 0` applied |

---

### 15. Activity Log on Shipment Detail

| # | Test | Result | Notes |
|---|------|--------|-------|
| 15.1 | Activity Log section visible on detail page | **PASS** | Timeline renders below shipment info |
| 15.2 | Creation event recorded | **PASS** | "Shipment created" entry with timestamp and user |
| 15.3 | Status change events recorded | **PASS** | fix #26 — "Shipment status changed: Pending -> In Transit" logged |
| 15.4 | Entries persist on page reload | **PASS** | fix #77 — all entries present after fresh load |

---

### 16. "Add Shipment" Button

| # | Test | Result | Notes |
|---|------|--------|-------|
| 16.1 | Button visible on shipments list | **PASS** | Top-right CTA |
| 16.2 | Navigates to `/en/admin/shipments/new` | **PASS** | New shipment form loads |

---

### 17. Barcode Scan

| # | Test | Result | Notes |
|---|------|--------|-------|
| 17.1 | Barcode scan input visible in UnifiedItemSelector | **PASS** | Placeholder text present |
| 17.2 | DN-prefix barcode recognized | **PASS** | Scans inventory items by DN code |
| 17.3 | CS-prefix barcode recognized | **PASS** | Scans center stones |
| 17.4 | SM-prefix barcode recognized | **PASS** | Scans semi-mount items |
| 17.5 | IV-prefix barcode support | **KNOWN GAP** | Placeholder reads `Scan barcode (DN, CS, SM)...` — IV prefix not supported; by design per triage |

---

## Defect Tracker

| ID | Title | Previous | Current | Notes |
|----|-------|----------|---------|-------|
| F-1 | "+" button opened Command Menu | FIXED R1 | FIXED | No regression |
| F-2 | Status filter ignored by backend | FIXED R2 | FIXED | fix #22/#76 |
| F-3 | Stale list status after Ship | FIXED R2 | FIXED | fix #77 |
| F-4 | Edit breadcrumb showed UUID | FIXED R2 | FIXED | fix #76 |
| F-5 | IV-prefix barcode not found | BY DESIGN | BY DESIGN | Per triage — known gap |
| F-6 | Total Items showed 1.00 decimal | FIXED R2 | FIXED | fix #78 |
| F-7 | Activity Log entries vanish on reload | FIXED R2 | FIXED | fix #77 |
| F-8 | `ReferenceError: t is not defined` in UnifiedItemSelector | CRITICAL R3 | FIXED | fix #91 — `useLocale()` restored to component scope |

---

## Warnings

| ID | Observation | Severity |
|----|-------------|----------|
| W-3 | "Mark as Delivered" dialog subtitle renders raw i18n key: `"Confirm Deliver Description"` instead of translated text | Low |
| W-4 | Button label inconsistency: "Add Shipment" in table view vs "Create Shipment" in card view — same action, different label | Low |
| W-5 | Barcode hint `(DN, CS, SM)...` omits IV — known gap, by design | Info |

---

## Fix Verification Summary

| Fix # | Description | Verified |
|-------|-------------|----------|
| #22 | Shipment filter missing statuses | PASS |
| #26 | Shipment status audit log | PASS |
| #76 | Status filter URL param + edit breadcrumb | PASS |
| #77 | Stale list after Ship/Deliver + activity log persistence | PASS |
| #78 | Total items decimal formatting | PASS |
| #91 | UnifiedItemSelector `t` crash | PASS |

---

## Test Coverage Summary

| Section | Tests Run | Pass | Fail | Warn |
|---------|-----------|------|------|------|
| Shipments List | 5 | 5 | 0 | 0 |
| Table/Card View | 4 | 3 | 0 | 1 |
| Status Filter | 6 | 6 | 0 | 0 |
| Search | 3 | 3 | 0 | 0 |
| New Shipment Form | 5 | 5 | 0 | 0 |
| Item Selection | 7 | 7 | 0 | 0 |
| Material Tracking | 5 | 5 | 0 | 0 |
| Create Shipment | 3 | 3 | 0 | 0 |
| Shipment Detail | 7 | 7 | 0 | 0 |
| Quick Actions: Ship | 4 | 4 | 0 | 0 |
| Quick Actions: Deliver | 5 | 5 | 0 | 0 |
| Deliver Dialog Text | 2 | 1 | 0 | 1 |
| Edit Shipment | 4 | 4 | 0 | 0 |
| Total Items Column | 1 | 1 | 0 | 0 |
| Activity Log | 4 | 4 | 0 | 0 |
| Add Shipment Button | 2 | 2 | 0 | 0 |
| Barcode Scan | 5 | 4 | 0 | 0 |
| **TOTAL** | **72** | **69** | **0** | **2** |

> 1 known gap (IV-prefix barcode — by design, not counted as fail or warn).

---

SUMMARY: Passed: 69 | Failed: 0 | Warnings: 2 | Known Gaps: 1
