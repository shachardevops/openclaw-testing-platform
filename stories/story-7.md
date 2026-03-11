# QA Report — Story 7: Inventory Lifecycle

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

---

## Regression Summary vs. r2

| Issue from Previous Runs | Status in r7 |
|---|---|
| Search requires Enter key | FIXED in r2 — verified still live/instant |
| Metal type/purity on detail | Known gap — not implemented (no DB columns) |
| Linked order/shipment refs on detail | Known gap — UI rendering not implemented |
| Side stones all "Out of Stock" | Data-dependent — investigate per environment |
| Inventory category tabs | Not implemented by design — single flat list |
| Export to Shipment / Export to Order in stock count | Confirmed implemented (r2 false positive corrected) |

---

## Test Execution

### 7.1 — Inventory List & Filters

| # | Test | Result | Notes |
|---|---|---|---|
| 7.1.1 | Navigate to /en/admin/inventory | PASS | Page loads with inventory table |
| 7.1.2 | Table columns: DN Code, Product, Model/SKU, Location, Status, Gold Weight, Cost, Selling Price | PASS | All columns present |
| 7.1.3 | Live search by DN code (e.g., DN10008) | PASS | Filters immediately, no Enter required |
| 7.1.4 | Live search by product name | PASS | Filters products in real-time |
| 7.1.5 | Search for non-existent DN — "No results found" + Clear button | PASS | Correct empty state |
| 7.1.6 | Filter dialog opens | PASS | Dialog with filter fields |
| 7.1.7 | Filter: Location dropdown | PASS | All locations listed |
| 7.1.8 | Filter: Status dropdown | PASS | Options: All, Available, Reserved, Sold, Damaged |
| 7.1.9 | Filter: Category dropdown | PASS | Product categories listed |
| 7.1.10 | Filter: Supplier dropdown | PASS | Suppliers listed |
| 7.1.11 | Apply Status = Sold filter | PASS | Filters list to sold items only |
| 7.1.12 | Active filter indicator | PASS | Button shows "Filters 1" when filter applied |
| 7.1.13 | Clear filter restores full list | PASS | |
| 7.1.14 | Pagination present and functional | PASS | Page N of M, 20 rows per page |
| 7.1.15 | No category tabs in inventory list (by design) | PASS | Inventory types share one table — not a bug |

---

### 7.2 — Inventory Item Detail

| # | Test | Result | Notes |
|---|---|---|---|
| 7.2.1 | Navigate to item detail via row click | PASS | /en/admin/inventory/{uuid} loads |
| 7.2.2 | DN code displayed as heading (h1) | PASS | e.g., "DN10008" |
| 7.2.3 | Product name shown as subheading | PASS | e.g., "CHAIN EK10090N01" |
| 7.2.4 | Model / SKU displayed | PASS | Model: EK10090N01 / SKU: EK10090N01-14KW |
| 7.2.5 | Current location displayed | PASS | e.g., "Main Warehouse" |
| 7.2.6 | Status displayed | PASS | e.g., "Available" |
| 7.2.7 | Gross Gold weight | PASS | e.g., 2.47g |
| 7.2.8 | Net Gold weight | PASS | e.g., 2.39g |
| 7.2.9 | Gold Value | PASS | e.g., $83.89 |
| 7.2.10 | Cost Price | PASS | e.g., $103.89 |
| 7.2.11 | Selling Price | PASS | e.g., $314 |
| 7.2.12 | Center Stones section | PASS | Shows assigned stones or "Center stones: Empty" with Add button |
| 7.2.13 | Side Stones section | PASS | Shows assigned stones or "Side Stones: Empty" with Add button |

---

### 7.3 — Movement History

| # | Test | Result | Notes |
|---|---|---|---|
| 7.3.1 | Movement History table visible on detail page | PASS | Table rendered below item details |
| 7.3.2 | Column: Date | PASS | "Mar 9, 2026, HH:MM PM" format |
| 7.3.3 | Column: Type | PASS | e.g., "Intake", "Transfer", "Sale" |
| 7.3.4 | Column: From | PASS | Origin location (or "--" for intake) |
| 7.3.5 | Column: To | PASS | Destination location |
| 7.3.6 | Column: Status | PASS | e.g., "Available", "Sold" |
| 7.3.7 | Column: Notes | PASS | e.g., "Initial creation" |
| 7.3.8 | Column: By | PASS | User name who performed action |
| 7.3.9 | Intake entries present | PASS | Initial creation records shown |
| 7.3.10 | Linked order/shipment references | WARN | Known gap — no clickable order/shipment reference IDs in movement log. Underlying data may exist but links not rendered in UI. |

---

### 7.4 — Metal Type/Purity Display

| # | Test | Result | Notes |
|---|---|---|---|
| 7.4.1 | Metal type shown on item detail (14K, 18K, etc.) | WARN | Known gap — not implemented. No supporting DB columns yet. Gold weights shown but not type/purity designation. |

---

### 7.5 — Stock Count

| # | Test | Result | Notes |
|---|---|---|---|
| 7.5.1 | Navigate to /en/admin/inventory/stock-count | PASS | Page loads with location selection UI |
| 7.5.2 | Location options displayed with item counts | PASS | e.g., "Main Warehouse (warehouse, 584 items)" |
| 7.5.3 | "Start Session" disabled before location selection | PASS | Button disabled until location chosen |
| 7.5.4 | Select location | PASS | Location highlighted, confirmation text shown |
| 7.5.5 | Start Session | PASS | Session created (SC-YYMMDD-NNNN); "Session started" notification |
| 7.5.6 | Scan DN Code input field | PASS | Text input for barcode/DN code entry |
| 7.5.7 | Scan DN code — item appears in Scanned section | PASS | Immediate feedback |
| 7.5.8 | Scanned item info: product name, DN code, location, user, status | PASS | All fields rendered |
| 7.5.9 | Progress counter updates: X / Y (Z%) | PASS | e.g., "1 / 585 (0%)" |
| 7.5.10 | Counter: Match | PASS | Correctly scanned items count |
| 7.5.11 | Counter: Issues | PASS | Items with discrepancies |
| 7.5.12 | Counter: Pending | PASS | Not yet scanned items |
| 7.5.13 | Counter: Sold-Reserved | PASS | Items in non-available status |
| 7.5.14 | "Not Yet Scanned" list loads | PASS | Paginated list of remaining items |
| 7.5.15 | Share session button | PASS | Available for multi-user stock counts |
| 7.5.16 | Leave session button | PASS | Present |
| 7.5.17 | Cancel session button | PASS | Present with confirmation |
| 7.5.18 | "Complete & Generate Report" button | PASS | Visible at bottom of page |
| 7.5.19 | Batch feature — "New" batch button | PASS | Available; All/Unbatched counts visible |
| 7.5.20 | Filters in scanned section: All / Available / Sold-Res / Issues | PASS | Tab filters present |
| 7.5.21 | Filters in unscanned section | PASS | Same tab structure |
| 7.5.22 | Export to Shipment | PASS | Export dialog available (confirmed implemented) |
| 7.5.23 | Export to Order | PASS | Export dialog available (confirmed implemented) |

---

### 7.6 — Center Stones

| # | Test | Result | Notes |
|---|---|---|---|
| 7.6.1 | Navigate to /en/admin/stones (Center Stones tab default) | PASS | Center Stones tab loads |
| 7.6.2 | Stone list renders with pagination | PASS | ~60 center stones across multiple pages |
| 7.6.3 | Column: Shape | PASS | PE (Pear), RD (Round), HT (Heart), MQ (Marquise), OV (Oval), EM (Emerald), AS (Asscher) |
| 7.6.4 | Column: Carat | PASS | e.g., 1.01ct, 2.00ct, 3.01ct, 4.05ct |
| 7.6.5 | Column: Quality (Color + Clarity + Cut) | PASS | e.g., "H SI1 Good" |
| 7.6.6 | Column: Lab | PASS | e.g., IGI |
| 7.6.7 | Column: Stock | PASS | e.g., 0/1, 0/2, 0/3 format |
| 7.6.8 | "Create Stone" button available | PASS | |
| 7.6.9 | Filters button available | PASS | Filter dialog for stone properties |

---

### 7.7 — Side Stones

| # | Test | Result | Notes |
|---|---|---|---|
| 7.7.1 | Switch to Side Stones tab at /en/admin/stones | PASS | Tab switches view |
| 7.7.2 | Search box placeholder changes to "Search by spec code..." | PASS | Context-aware placeholder |
| 7.7.3 | Side stone spec list renders | PASS | ~340 spec types with pagination |
| 7.7.4 | Column: Spec Code | PASS | e.g., SS-LGD-RD-4.7mm, SS-LGD-PS-5.4x3.5 |
| 7.7.5 | Column: Shape | PASS | Round, Pear, Oval, Emerald |
| 7.7.6 | Column: Dimensions | PASS | e.g., 4.7mm, 5.4-5.4 x 3.5-3.5mm |
| 7.7.7 | Column: Stock | WARN | All records show "Out of Stock" — possible data issue or expected if stock was zeroed in test refresh |
| 7.7.8 | "Create" button available | PASS | |
| 7.7.9 | Filters button available | PASS | |

---

### 7.8 — Inventory from Product Detail

| # | Test | Result | Notes |
|---|---|---|---|
| 7.8.1 | Navigate to a product detail page | PASS | /en/admin/products/{id} loads |
| 7.8.2 | Inventory section on product page shows linked items | PASS | DN codes for this product listed |
| 7.8.3 | Items show DN code, location, status | PASS | |
| 7.8.4 | Click inventory item navigates to inventory detail | PASS | Links to /en/admin/inventory/{uuid} |

---

## Defects & Observations

### WARN-01 — Linked Order/Shipment References Not Rendered (TC 7.3.10)
- **Where:** Inventory item detail, Movement History table
- **Expected:** Clickable order/shipment reference numbers linking to respective detail pages
- **Actual:** Movement history shows type, locations, status, notes, user — but no order/shipment reference IDs or links
- **Impact:** Medium. Traceability gap — cannot navigate from movement to originating order/shipment. Known gap documented in fixes.md #32.

### WARN-02 — Metal Type/Purity Not Displayed (TC 7.4.1)
- **Where:** Inventory item detail page
- **Expected:** Metal type (14K, 18K) and purity percentage shown
- **Actual:** Gold weights (gross/net/value) shown but no metal type designation
- **Impact:** Low. Known gap — no supporting DB columns implemented yet. Documented in fixes.md #31.

### WARN-03 — Side Stones All "Out of Stock" (TC 7.7.7)
- **Where:** /en/admin/stones, Side Stones tab
- **Expected:** Stock quantities visible (carat amounts were visible in r1)
- **Actual:** All records show "Out of Stock"
- **Impact:** Medium. Possible regression from r1 where carat quantities (173.35ct, 127.08ct) were visible. May be data-dependent — investigate if stock was zeroed in test data refresh or if schema changed.

---

## Test Coverage Summary

| Section | Tests | Pass | Fail | Warn |
|---|---|---|---|---|
| Inventory List & Filters | 15 | 15 | 0 | 0 |
| Inventory Item Detail | 13 | 13 | 0 | 0 |
| Movement History | 10 | 9 | 0 | 1 |
| Metal Type/Purity | 1 | 0 | 0 | 1 |
| Stock Count | 23 | 23 | 0 | 0 |
| Center Stones | 9 | 9 | 0 | 0 |
| Side Stones | 9 | 8 | 0 | 1 |
| Inventory from Product Detail | 4 | 4 | 0 | 0 |
| **TOTAL** | **84** | **81** | **0** | **3** |

---

SUMMARY: Passed: 81 | Failed: 0 | Warnings: 3
