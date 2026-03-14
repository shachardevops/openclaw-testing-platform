# QA Report — Story 17: Fancy Color Parcels (Full Feature)

**Run:** r1
**Date:** 2026-03-13
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile)
**Login (admin):** test@example.com / 121212
**Login (supplier):** supplier@example.com / 121212

## Scope

End-to-end testing of the Fancy Color Parcels feature: parcel CRUD, splitting, shipment integration, supplier order linking, supplier intake extraction, parcel detail with extraction history, and i18n/RTL compliance.

**Prerequisite data:** At least one warehouse location and one supplier location must exist. At least one supplier order with `material_type = "finished"` should exist for intake testing.

---

## 1. Parcels Page — Navigation & List (`/en/admin/parcels`)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.1.1 | Sidebar shows "Parcels" nav item | New nav entry visible in admin sidebar | | |
| 17.1.2 | Click Parcels nav → page loads | `/en/admin/parcels` renders with data table | | |
| 17.1.3 | Page header shows title "Parcels" | Translated title from `t("parcels.title")` | | |
| 17.1.4 | "Create Parcel" button present | Button visible in page header actions | | |
| 17.1.5 | Table columns render | Parcel Code, Name, Stone Type, Original Weight, Remaining Weight, Status, Location | | |
| 17.1.6 | Empty state renders if no parcels | Shows appropriate empty state message | | |
| 17.1.7 | Search filters parcels by name/code | Type in search bar, table updates | | |
| 17.1.8 | Status filter works | Filter by active/in_transit/depleted/closed | | |
| 17.1.9 | Pagination controls work | Navigate between pages if >20 parcels | | |
| 17.1.10 | Click parcel row → navigates to detail | Goes to `/en/admin/parcels/{id}` | | |

---

## 2. Parcel Creation

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.2.1 | Click "Create Parcel" → dialog opens | Dialog with form fields appears | | |
| 17.2.2 | Dialog has RTL support | `dir` attribute set on DialogContent | | |
| 17.2.3 | Form fields present | Name, Stone Type (NAT/LGR), Weight (ct), Location (warehouse dropdown), Notes | | |
| 17.2.4 | Location dropdown shows only warehouses | No suppliers/customers in the dropdown | | |
| 17.2.5 | Stone Type defaults to "LGR" | LGR pre-selected | | |
| 17.2.6 | Submit with empty name → shows error | "Name is required" validation message | | |
| 17.2.7 | Submit with empty weight → shows error | "Weight is required" validation message | | |
| 17.2.8 | Submit with valid data → parcel created | Toast success, dialog closes, table refreshes | | |
| 17.2.9 | New parcel appears in table | Shows auto-generated PRC-XXXXX code, status "active" | | |
| 17.2.10 | Weight field accepts decimals (e.g., 5.234) | Input `type="number"` with `step="0.001"` | | |
| 17.2.11 | Cancel button closes dialog without creating | No toast, no new row | | |

---

## 3. Parcel Editing

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.3.1 | Row actions menu has "Edit" option | Context menu or action button present | | |
| 17.3.2 | Click Edit → dialog opens pre-filled | Name, stone type, weight pre-populated | | |
| 17.3.3 | Location field hidden on edit | Location is read-only after creation | | |
| 17.3.4 | Change name → save → name updates | Toast success, table reflects change | | |
| 17.3.5 | Weight field editable if no extractions yet | original_weight == remaining_weight → editable | | |
| 17.3.6 | Weight field read-only after extraction | If weights differ, weight section is disabled/hidden | | |

---

## 4. Parcel Detail Page (`/en/admin/parcels/{id}`)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.4.1 | Page loads with parcel info | Name in header, parcel code as subtitle | | |
| 17.4.2 | Status badge renders correctly | Badge shows status (active/in_transit/depleted/closed) | | |
| 17.4.3 | "closed" badge uses secondary variant | Gray/muted badge, NOT red/destructive | | |
| 17.4.4 | Summary cards render | Original Weight, Remaining Weight, Stone Type, Location — 4 cards | | |
| 17.4.5 | Progress bar shows extraction percentage | Correct percentage (extracted / original * 100) | | |
| 17.4.6 | Back button navigates to parcels list | Arrow/back link to `/en/admin/parcels` | | |
| 17.4.7 | Edit button present (active parcels) | Opens edit dialog | | |
| 17.4.8 | Split button present (active parcels) | Opens split dialog | | |
| 17.4.9 | Close button present (active parcels) | Opens confirmation dialog (NOT immediate action) | | |
| 17.4.10 | Close confirmation dialog renders | AlertDialog with title, description, Cancel and Close buttons | | |
| 17.4.11 | Close confirmation has RTL dir | `dir` attribute on AlertDialogContent, `text-start` class | | |
| 17.4.12 | Confirm close → parcel status changes to "closed" | Toast success, status badge updates, action buttons disappear | | |
| 17.4.13 | Cancel close → nothing happens | Dialog closes, parcel unchanged | | |
| 17.4.14 | No action buttons for closed/depleted parcels | Edit, Split, Close buttons hidden | | |
| 17.4.15 | Extraction history table renders | Columns: Stone, Shape, Color, Weight, Jewelry Item, Date | | |
| 17.4.16 | Empty extraction history shows message | "No extractions" placeholder when no stones extracted | | |
| 17.4.17 | Jewelry item links to inventory detail | Clickable unique_item_id links to `/en/admin/inventory/{id}` | | |

---

## 5. Parcel Splitting

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.5.1 | Click Split on detail or list → dialog opens | Split dialog with source parcel info | | |
| 17.5.2 | Source parcel info shown | Name and remaining weight displayed in info box | | |
| 17.5.3 | Form fields: New Name, Transfer Weight | Both present with labels | | |
| 17.5.4 | Weight field placeholder shows max weight | e.g., "Max 5.233 ct" | | |
| 17.5.5 | Submit with weight >= remaining → error | "Weight exceeds remaining" validation | | |
| 17.5.6 | Submit with valid weight → split succeeds | Toast success, new parcel created, source weight decremented | | |
| 17.5.7 | New child parcel appears in list | Same stone type, transfer weight as original weight | | |
| 17.5.8 | Child parcel detail shows parent parcel link | "Parent Parcel" section with link to source | | |
| 17.5.9 | Source parcel detail shows child parcels table | "Child Parcels" section with link to new parcel | | |
| 17.5.10 | Weight field starts empty (not "0") | Input placeholder shown, no pre-filled "0" value | | |

---

## 6. Parcel Deletion

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.6.1 | Delete option available for parcels with no extractions | Context menu or action button present | | |
| 17.6.2 | Delete removes parcel from list | Soft delete, parcel disappears from table | | |
| 17.6.3 | Delete blocked for parcels with extracted stones | Error message: "Cannot delete parcel with extracted stones" | | |

---

## 7. Shipment Integration — Create Shipment with Parcel

**Prerequisite:** At least one active parcel at a warehouse location.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.7.1 | Navigate to create shipment (`/en/admin/shipments/new`) | Shipment creation form loads | | |
| 17.7.2 | Parcel item type available in item selector | "Parcel" option in item type dropdown/tabs | | |
| 17.7.3 | Select "From" location → parcel selector shows parcels at that location | Only active parcels at the selected origin location | | |
| 17.7.4 | Add parcel to shipment → parcel appears in items list | Shows parcel code, name, weight | | |
| 17.7.5 | Submit shipment → parcel status changes | Parcel status becomes "in_transit" (not "reserved") | | |
| 17.7.6 | Shipment detail shows parcel item | Parcel item rendered with code, name, weight info | | |

---

## 8. Shipment Integration — Status Transitions

**Prerequisite:** A shipment with a parcel item in "pending" status.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.8.1 | Ship shipment → parcel status "in_transit" | Parcel's status field updates in DB | | |
| 17.8.2 | Deliver shipment → parcel status "active" | Parcel status reverts to "active" at destination | | |
| 17.8.3 | Deliver shipment → parcel location updates | Parcel's location_id set to shipment's to_location_id | | |
| 17.8.4 | Delete/cancel shipment → parcel status "active" | Parcel reverts to "active" (not "available") | | |
| 17.8.5 | Remove parcel from shipment → parcel status "active" | Status correctly reverted to "active" | | |

---

## 9. Shipment Integration — Item Count

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.9.1 | Shipment with parcels shows correct total_items | Parcel count included in total | | |
| 17.9.2 | Shipment item type breakdown includes parcel count | "parcel: N" in item counts | | |

---

## 10. Supplier Order Integration

**Prerequisite:** At least one supplier and one active parcel at that supplier's location.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.10.1 | Create supplier order item form shows "Source Parcels" field | Optional multi-select dropdown present | | |
| 17.10.2 | Parcel dropdown shows parcels at supplier's location | Only active parcels at the selected supplier | | |
| 17.10.3 | Select parcels → saved to supplier_order_items.parcel_ids | Stored as UUID array | | |
| 17.10.4 | Supplier order detail shows linked parcels | Parcel codes/names visible on item detail | | |

---

## 11. Supplier Intake — Parcel Extraction (Core Flow)

**Login as supplier:** supplier@example.com / 121212

**Prerequisite:** A supplier order item with linked parcels, and those parcels at the supplier's location.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.11.1 | Open intake form for supplier order item | Side stones section visible | | |
| 17.11.2 | "Side Stones" label is translated | Shows `t("inventory.sideStones")`, not hardcoded English | | |
| 17.11.3 | "From Parcel" mode available in side stones section | Toggle/tab to switch to parcel extraction mode | | |
| 17.11.4 | Parcel selector shows available parcels | Dropdown with parcel names and remaining weights | | |
| 17.11.5 | Select parcel → remaining weight displayed | Shows current remaining weight in real-time | | |
| 17.11.6 | Shape dropdown shows stone shapes | Round, Princess, Emerald, etc. from STONE_SHAPES | | |
| 17.11.7 | Color dropdown shows translated fancy colors | "Fancy Yellow", "Fancy Pink", etc. (translated via `t()`) | | |
| 17.11.8 | Hebrew locale: colors show Hebrew translations | Verify colors are not raw English in Hebrew mode | | |
| 17.11.9 | Enter stone: shape=RD, size=1.2mm, weight=0.05ct, color=Fancy Yellow | All fields accept input | | |
| 17.11.10 | Click "Add" → stone extracted from parcel | Parcel remaining weight decrements by 0.05ct | | |
| 17.11.11 | Extracted stone appears in added stones list | Shows shape, size, weight, color with Edit/Remove buttons | | |
| 17.11.12 | Add second stone from same parcel | Remaining weight decrements again | | |
| 17.11.13 | Try extracting more than remaining weight → blocked | Error: insufficient weight | | |
| 17.11.14 | Remove extracted stone → weight returned to parcel | Remaining weight increments back | | |
| 17.11.15 | Edit extracted stone weight → parcel adjusted | Weight difference deducted/returned atomically | | |

---

## 12. Inventory Detail — Parcel Origin Display

**Prerequisite:** A jewelry inventory item with side stones extracted from a parcel.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.12.1 | Navigate to inventory detail (`/en/admin/inventory/{id}`) | Side Stones section renders | | |
| 17.12.2 | Parcel-origin stones show parcel badge/link | Parcel code displayed with link to parcel detail | | |
| 17.12.3 | Click parcel code → navigates to parcel detail | Goes to `/en/admin/parcels/{parcel_id}` | | |
| 17.12.4 | Non-parcel stones don't show parcel column | Column only appears if any stones have parcel origin | | |
| 17.12.5 | Side stones section labels translated | No hardcoded English fallbacks (no `|| "fallback"`) | | |
| 17.12.6 | Remove side stone confirmation dialog has RTL support | `dir={dir}` and `className="text-start"` on AlertDialogContent | | |

---

## 13. Parcel Detail — Extraction History (Admin View)

**Login as admin:** test@example.com / 121212

**Prerequisite:** A parcel with at least 2 extracted stones.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.13.1 | Navigate to parcel detail page | Extraction History table visible | | |
| 17.13.2 | Table shows all extracted stones | One row per extraction with correct data | | |
| 17.13.3 | Columns: Stone spec, Shape, Color, Weight, Jewelry Item, Date | All columns present | | |
| 17.13.4 | Jewelry Item links to inventory detail | Clickable unique_item_id | | |
| 17.13.5 | Remaining weight matches original minus sum of extractions | Weight accounting is correct | | |
| 17.13.6 | Auto-depletion: extract until remaining ~0 → status "depleted" | Parcel auto-depletes via DB trigger | | |
| 17.13.7 | Return stone to depleted parcel → status "active" | Parcel auto-reactivates | | |

---

## 14. Security — RLS Policies

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.14.1 | Admin can see all parcels | Full list regardless of location | | |
| 17.14.2 | Supplier can only see parcels at their locations | Log in as supplier, verify only their parcels visible | | |
| 17.14.3 | Buyer cannot see any parcels | Log in as buyer (buyer@example.com / 121212), verify no parcel access | | |
| 17.14.4 | Supplier can update parcels at their location | Weight changes during extraction succeed | | |
| 17.14.5 | Supplier cannot update parcels at other locations | Attempting extraction on non-local parcel → access denied | | |

---

## 15. Hebrew Locale & RTL (`/he/admin/parcels`)

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.15.1 | Switch to Hebrew → parcels page renders RTL | Text right-aligned, table mirrored | | |
| 17.15.2 | Page title translated | Hebrew title for "Parcels" | | |
| 17.15.3 | All table column headers translated | Hebrew labels for all columns | | |
| 17.15.4 | Create dialog renders RTL | `dir="rtl"` on DialogContent | | |
| 17.15.5 | Split dialog renders RTL | `dir="rtl"` on DialogContent | | |
| 17.15.6 | Close confirmation dialog renders RTL | `dir` attribute and `text-start` class present | | |
| 17.15.7 | Status badge labels translated | Hebrew text for active/in_transit/depleted/closed | | |
| 17.15.8 | Parcel codes (PRC-XXXXX) render LTR in RTL context | Alphanumeric codes read left-to-right | | |
| 17.15.9 | Weight values render LTR | Numbers and "ct" suffix read left-to-right | | |
| 17.15.10 | Fancy color names translated in intake form | Hebrew color names in dropdown (not raw English) | | |

---

## 16. Supplier Inventory — Parcels Tab

**Login as supplier:** supplier@example.com / 121212

**Prerequisite:** At least one active parcel at the supplier's location.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.16.1 | Navigate to supplier inventory `/supplier/inventory` | Page loads with tabs | | |
| 17.16.2 | 4th tab "Parcels" visible with Boxes icon | Tab appears after Side Stones | | |
| 17.16.3 | Click Parcels tab → shows active parcels | Card-based layout with parcel info | | |
| 17.16.4 | Parcel card shows name, code, stone type | All info visible on card | | |
| 17.16.5 | Parcel card shows weight progress bar | Remaining/original weight with visual progress | | |
| 17.16.6 | Parcel card has status badge | "Active" badge displayed | | |
| 17.16.7 | "Break Down" button present on each card | Button with Hammer icon | | |
| 17.16.8 | Click "Break Down" → navigates to breakdown page | Goes to `/supplier/inventory/parcel-breakdown/{id}` | | |
| 17.16.9 | Empty state if no parcels | "No active parcels at your location" message with Boxes icon | | |
| 17.16.10 | Hebrew locale: tab and cards render RTL | Correct RTL layout and translated labels | | |

---

## 17. Standalone Parcel Breakdown Page

**Login as supplier:** supplier@example.com / 121212

**Prerequisite:** An active parcel at the supplier's location.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.17.1 | Page loads with parcel info | Name, code, stone type, status badge visible | | |
| 17.17.2 | Back to Inventory link present | Arrow link navigates to `/supplier/inventory` | | |
| 17.17.3 | Weight progress bar renders | Shows remaining/original weight with progress bar | | |
| 17.17.4 | Extracted weight shown below progress | Calculated as original - remaining | | |
| 17.17.5 | "Add Stone" card visible for active parcels | Form with Shape, Color, Size, Weight fields | | |
| 17.17.6 | Shape dropdown shows all stone shapes | Round, Princess, Emerald, Oval, etc. | | |
| 17.17.7 | Color dropdown shows translated fancy colors | Fancy Yellow, Fancy Pink, etc. | | |
| 17.17.8 | Add button disabled when form incomplete | Requires shape, color, size > 0, weight > 0 | | |
| 17.17.9 | Add stone → success toast, form resets | "Stone added successfully" toast | | |
| 17.17.10 | Added stone appears in Extracted Stones table | Shows shape, size, weight, color, "Free" status | | |
| 17.17.11 | Remaining weight updates after add | Progress bar and weight text update | | |
| 17.17.12 | Add another stone → table grows | Multiple stones listed | | |
| 17.17.13 | Try adding stone with weight > remaining → error | "Insufficient weight" error toast | | |
| 17.17.14 | Remove button visible on "Free" stones | Trash icon on unassigned stones | | |
| 17.17.15 | Click remove → confirmation dialog | "Remove this stone?" dialog appears | | |
| 17.17.16 | Confirm remove → stone deleted, weight returned | "Stone removed" toast, weight increments back | | |
| 17.17.17 | "Used" stones have no remove button | Assigned stones cannot be removed from this page | | |
| 17.17.18 | No "Add Stone" form for closed/depleted parcels | Form card hidden if parcel not active | | |
| 17.17.19 | Empty extraction table shows message | "No stones extracted yet. Start measuring!" | | |
| 17.17.20 | Hebrew locale: page renders RTL correctly | All text, forms, tables in RTL layout | | |

---

## 18. Pre-Extracted Stones in Intake

**Login as supplier:** supplier@example.com / 121212

**Prerequisite:** An active parcel with at least 2 unassigned (standalone-extracted) stones, and a supplier order for intake.

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.18.1 | Open intake form → Side Stones section shows 3 tabs | "From Spec", "From Parcel", "Pre-Extracted" tabs visible | | |
| 17.18.2 | "Pre-Extracted" tab only visible when parcels exist | If no parcels at location, tabs don't show | | |
| 17.18.3 | Click "Pre-Extracted" → parcel selector appears | Dropdown with active parcels | | |
| 17.18.4 | Select parcel → unassigned stones listed | Clickable stone entries with shape, color, size, weight | | |
| 17.18.5 | Click a stone → added to form as badge | Badge shows parcel code and spec code | | |
| 17.18.6 | Stone removed from available list after adding | Can't add the same stone twice | | |
| 17.18.7 | Badge has Boxes icon and close button | Pre-extracted stones have parcel icon | | |
| 17.18.8 | Remove pre-extracted stone from form → reappears in list | Stone available again for selection | | |
| 17.18.9 | Submit intake with pre-extracted stones → stones assigned | Stones' inventory_id updated from NULL to jewelry item | | |
| 17.18.10 | Assigned stones appear as "Used" on breakdown page | Status changes from "Free" to "Used" | | |
| 17.18.11 | Empty parcel shows "No unassigned stones" message | When all stones already assigned or none extracted | | |
| 17.18.12 | Mix pre-extracted + spec + parcel stones in same intake | All three sources coexist | | |

---

## 19. Edge Cases

| # | Test | Expected | Result | Notes |
|---|------|----------|--------|-------|
| 17.19.1 | Create parcel with weight 0.001 (minimum) | Succeeds, minimum valid weight | | |
| 17.19.2 | Extract exact remaining weight → parcel depletes | Status auto-changes to "depleted" | | |
| 17.19.3 | Split parcel with weight = remaining - 0.001 | Succeeds, source left with 0.001ct → may auto-deplete | | |
| 17.19.4 | Mix parcel + regular side stones on same jewelry item | Both types coexist in side stones table | | |
| 17.19.5 | Multiple parcels used on same jewelry item | Stones from different parcels appear in side stones list | | |
| 17.19.6 | Close an active parcel with remaining weight > 0 | Allowed — archival action | | |
| 17.19.7 | Try to ship a closed parcel | Should be blocked (closed parcels not shippable) | | |
| 17.19.8 | Try to ship a depleted parcel | Should be blocked (depleted parcels not shippable) | | |
| 17.19.9 | Standalone extract → close parcel → verify "Free" stones remain | Unassigned stones still exist, breakdown page shows no add form | | |
| 17.19.10 | Assign pre-extracted stone to inventory → try assigning again | Error: "already assigned to an inventory item" | | |
| 17.19.11 | Standalone extract all weight → parcel auto-depletes | Status becomes "depleted", no more extractions | | |
| 17.19.12 | Remove standalone stone from depleted parcel → reactivates | Parcel becomes "active" again | | |

---

## Defects & Observations

| # | Severity | Page | Description | Notes |
|---|----------|------|-------------|-------|
| | | | | |

**Severity key:** BUG = broken functionality, WARN = visual issue, INFO = minor cosmetic

---

## Test Coverage Summary

| Section | Tests | Pass | Fail | Warn |
|---------|-------|------|------|------|
| Parcels Page — List | 10 | — | — | — |
| Parcel Creation | 11 | — | — | — |
| Parcel Editing | 6 | — | — | — |
| Parcel Detail Page | 17 | — | — | — |
| Parcel Splitting | 10 | — | — | — |
| Parcel Deletion | 3 | — | — | — |
| Shipment — Create | 6 | — | — | — |
| Shipment — Status | 5 | — | — | — |
| Shipment — Counts | 2 | — | — | — |
| Supplier Order Integration | 4 | — | — | — |
| Supplier Intake — Extraction | 15 | — | — | — |
| Inventory Detail — Parcel Origin | 6 | — | — | — |
| Extraction History (Admin) | 7 | — | — | — |
| Security — RLS | 5 | — | — | — |
| Hebrew & RTL | 10 | — | — | — |
| Supplier Inventory — Parcels Tab | 10 | — | — | — |
| Standalone Parcel Breakdown | 20 | — | — | — |
| Pre-Extracted Stones in Intake | 12 | — | — | — |
| Edge Cases | 12 | — | — | — |
| **TOTAL** | **171** | — | — | — |

---

SUMMARY: Passed: — | Failed: — | Warnings: —
