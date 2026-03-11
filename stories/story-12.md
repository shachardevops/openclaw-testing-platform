# QA Report — Story 12: Supplier Orders (Admin Side)

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

## Scope

Admin-side supplier order management: creation form, supplier selection, items, ship-to, notes, form validation, navigation, and all fixes from QA runs.

---

## 1. Supplier Orders List (`/en/admin/supplier-orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.1.1 | Page loads | List of supplier orders with columns | |
| 12.1.2 | Columns: Order #, Supplier, Items, Status, Priority, Expected Delivery, Created | All present | |
| 12.1.3 | "New Supplier Order" button | Navigates to creation form | |
| 12.1.4 | Search by order number or supplier name | Live search works | |
| 12.1.5 | Status filter | All statuses available | |

---

## 2. New Supplier Order Form

### 2a. Supplier Selection

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.2.1 | Recent Suppliers chips shown (if any in localStorage) | Chips rendered from useRecentSuppliers() | |
| 12.2.2 | Chip click sets supplier_id | form.setValue with shouldDirty:true (fix #112) | |
| 12.2.3 | Selected chip highlighted | bg-muted text-foreground border-border | |
| 12.2.4 | Supplier chip with stale localStorage ID | Order Summary shows "Not selected" — data issue not code bug | Clear localStorage to fix |
| 12.2.5 | Supplier dropdown search | All suppliers listed, searchable | |
| 12.2.6 | Selecting from dropdown updates Order Summary | supplier name shown in summary | |
| 12.2.7 | Dropdown selection adds to Recent Suppliers | Saved to localStorage | |

### 2b. Priority & Destination

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.2.8 | Priority options: normal, high, urgent | All 3 toggle buttons work | |
| 12.2.9 | Urgent priority shows red dot indicator | Inline dot before label | |
| 12.2.10 | Ship To Type: warehouse, supplier, customer | All 3 options toggle | |
| 12.2.11 | Switching destination type clears location | form.setValue("ship_to_location_id", undefined) | |
| 12.2.12 | Location dropdown filtered by destination type | Shows relevant locations only | |
| 12.2.13 | Expected delivery date picker | Calendar input works | |
| 12.2.14 | QuickCreate Location dialog | Opens for each location type | |
| 12.2.15 | QuickCreate location callback sets value with shouldDirty | fix #112: shouldDirty:true | |

### 2c. Items Management

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.2.16 | Add Item section | Product search, material type selection | |
| 12.2.17 | Item types: finished product, semi-mount, metal, stone | All types supported | |
| 12.2.18 | Item quantity and unit cost | Editable per item | |
| 12.2.19 | Cart/items list updates | Items listed with remove button | |
| 12.2.20 | Auth on add/delete item mutations | requireAdmin() enforced (fix #52) | |

### 2d. Notes Section

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.2.21 | Notes collapsible section | Chevron toggles, section expands/collapses | |
| 12.2.22 | ChevronRight RTL rotation | `rtl:rotate-180` class applied (fix #111) | |
| 12.2.23 | Notes indicator dot | Shows when notes have content | |
| 12.2.24 | Notes textarea | Accepts text input | |
| 12.2.25 | Internal Notes textarea | Separate field for admin-only notes | |

### 2e. Order Summary (right column)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.2.26 | Summary shows selected supplier | Name or "Not selected" | |
| 12.2.27 | Summary shows priority | Badge with correct label | |
| 12.2.28 | Summary shows expected delivery | Date or "Not set" | |
| 12.2.29 | Summary shows ship-to type + location | Icon + name or "Not selected" | |
| 12.2.30 | Summary shows items count and total cost | Correct calculations | |
| 12.2.31 | Summary shows notes (if any) | Truncated preview | |
| 12.2.32 | Summary only shows for new orders (not edit) | Hidden when isEditing | |

---

## 3. Form Submission

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.3.1 | "Save as Draft" submits with saveAsDraft flag | Toast: "Saved as draft" | |
| 12.3.2 | "Create & Send" submits without draft flag | Toast: "Order created and sent" | |
| 12.3.3 | On success redirect includes locale | `/${locale}/admin/supplier-orders/${id}` (fix #110) | Was 404 without locale |
| 12.3.4 | Validation: supplier required | Error shown if empty | |
| 12.3.5 | Validation: at least 1 item required | Error or disabled submit | |

---

## 4. Edit Supplier Order

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.4.1 | Edit form pre-fills all fields | Supplier, priority, items, notes | |
| 12.4.2 | Update submits correctly | Toast: "Order updated" | |
| 12.4.3 | On success redirect includes locale | `/${locale}/admin/supplier-orders/${id}` (fix #110) | |
| 12.4.4 | Order Summary hidden in edit mode | isEditing check | |

---

## 5. Supplier Order Detail Page

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.5.1 | Detail page loads | Full order info rendered | |
| 12.5.2 | Progress tracker | Draft → Sent → In Progress → Shipped → Completed | |
| 12.5.3 | Items table | All items with type, quantity, cost | |
| 12.5.4 | Ship-to information | Type + location name | |
| 12.5.5 | Actions: Send to Supplier, Cancel | Available per status | |

---

## 6. Hebrew Locale (RTL)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 12.6.1 | Form renders correctly in RTL | All fields aligned right | |
| 12.6.2 | ChevronRight on notes rotated in RTL | Points left with `rtl:rotate-180` (fix #111) | |
| 12.6.3 | Order Summary renders in RTL | Correct alignment | |
| 12.6.4 | All labels translated | No hardcoded English strings | |
| 12.6.5 | Priority labels translated | supplierOrders.priorities.{value} | |
| 12.6.6 | Destination type labels translated | supplierOrders.shipTo{Type} | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 47 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
