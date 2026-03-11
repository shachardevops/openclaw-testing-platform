# QA Report — Story 6: Admin Manual Order

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

---

## Regression Summary vs. r4

| Issue from Previous Runs | Status in r7 |
|---|---|
| "..." order actions button opened search palette | FIXED in r4 — verified still passing |
| Record Payment API returned 500 | FIXED in r4 — verified still passing |
| Edit quantity did not persist after save | FIXED in r4 — verified still passing |
| #46: Order detail "..." menu only had "Print" | FIXED — now has Print/Mark as Delivered/Cancel/Delete |
| #48: Payment status not recalculated via Edit Order | FIXED — auto-recalc on item/discount change |
| #65: Actual payment not logged to Activity Log | FIXED — logActivity() added to recordPayment() |
| #67: Date filter missing from Orders Filters panel | FIXED — startDate/endDate date filters added |
| #73: Overpaid payment status missing | FIXED — overpaid status added with blue badge |
| #75: No-op "Confirmed > Confirmed" activity log entries | FIXED — guard added |
| W1: Card view "No Orders Description" placeholder | Unchanged — still showing |
| W2: Broken product images (external valigara.com URLs) | Unchanged — external CDN issue |
| W3: Stale data flash after save redirect | Unchanged — ~500ms flash, data corrects |

---

## Test Execution

### 1. Authentication

| # | Test | Result | Notes |
|---|---|---|---|
| 1.1 | Admin login with valid credentials | PASS | test@example.com / 121212 — Dashboard loads |

---

### 2. Orders List — UI & Navigation

| # | Test | Result | Notes |
|---|---|---|---|
| 2.1 | Orders list page loads at /en/admin/orders | PASS | Table renders with data |
| 2.2 | Table columns: Order #, Date, Customer, Items, Total, Payment, Status, Customer Notes | PASS | All columns present |
| 2.3 | Search bar functional (order number, customer name) | PASS | Real-time filtering |
| 2.4 | Filters panel opens | PASS | Status, Payment Status, Customer, Start Date, End Date filters present |
| 2.5 | Table / Card view toggle | PASS | Both views switch correctly |
| 2.6 | Card view empty state text | WARN | Shows "No Orders Description" — unreplaced i18n placeholder |
| 2.7 | Empty state with search: "No Orders Found" icon + message + "Clear search" | PASS | Correct empty state |
| 2.8 | Clear search restores full list | PASS | All orders return |
| 2.9 | Row-level "Open Menu" dropdown | PASS | Actions: Edit Order, Record Payment, Mark as Delivered, Cancel |
| 2.10 | Date column sortable | PASS | "Sort and filter column: Date" button present and functional |
| 2.11 | Date sort toggles asc/desc | PASS | Click toggles between ascending and descending |

---

### 3. Create Order — New Customer Flow

| # | Test | Result | Notes |
|---|---|---|---|
| 3.1 | "Add Order" button opens creation form | PASS | Full form renders with all sections |
| 3.2 | New / Existing customer toggle | PASS | Both buttons switch form fields correctly |
| 3.3 | Customer fields: Name, Phone, Email | PASS | All accept input |
| 3.4 | Delivery method: Pickup / Delivery / Shipping | PASS | All three options toggle correctly |
| 3.5 | Shipping selection shows Delivery Address field | PASS | Conditional field appears |
| 3.6 | Product selection dialog opens | PASS | Categorized products with pricing |
| 3.7 | Product images in selection dialog | WARN | Multiple broken images from external valigara.com CDN |
| 3.8 | "From Inventory" items load with specs | PASS | DN codes, sizes, metal types, availability shown |
| 3.9 | "Custom Item" tab: name + price fields | PASS | Line Total calculates in real-time |
| 3.10 | "Add to Order" — custom item | PASS | Toast: "Custom item added to order"; form resets |
| 3.11 | "Add to Order" — inventory item | PASS | Button changes to "Added" (disabled); prevents double-add |
| 3.12 | Order Summary updates live (items count, subtotal, total) | PASS | All values recalculate on item add |
| 3.13 | "Create Order" button enabled only with >= 1 items | PASS | Disabled with 0 items |
| 3.14 | Submit creates order successfully | PASS | Toast: "Order created successfully"; redirects to detail |

---

### 4. Order Detail Page

| # | Test | Result | Notes |
|---|---|---|---|
| 4.1 | Order number assigned (ORD-YYYYMM-NNNNN format) | PASS | Correctly formatted |
| 4.2 | Order date shows creation date | PASS | Mar 9, 2026 |
| 4.3 | Status: Pending on creation | PASS | Default status |
| 4.4 | Payment Status: Pending on creation | PASS | Default payment status |
| 4.5 | Order Progress timeline renders | PASS | Pending > Confirmed > Processing > Ready > Shipped > Delivered |
| 4.6 | Items listed with correct details (name, price, specs) | PASS | Custom + inventory items with DN code, size, metal type |
| 4.7 | Material Totals section | PASS | Gold weights and stone carats summed correctly |
| 4.8 | Customer info in sidebar (Name, Phone, Email) | PASS | |
| 4.9 | Delivery info in sidebar (Method, Address) | PASS | |
| 4.10 | "..." ellipsis menu opens with actions | PASS | fix #46 |
| 4.11 | "..." menu: Print option | PASS | |
| 4.12 | "..." menu: Mark as Delivered option (when shipped) | PASS | fix #46 |
| 4.13 | "..." menu: Cancel option (for active orders) | PASS | fix #46 |
| 4.14 | "..." menu: Delete option (for pending/cancelled/returned) | PASS | fix #46, with deletion preview dialog |

---

### 5. Status Management

| # | Test | Result | Notes |
|---|---|---|---|
| 5.1 | Status dropdown opens on badge click | PASS | Reveals all status options |
| 5.2 | All 8 statuses present: Pending, Confirmed, Processing, Ready, Shipped, Delivered, Cancelled, Returned | PASS | |
| 5.3 | Status change: Pending > Confirmed | PASS | Badge updates; timeline node fills |
| 5.4 | Status change: Confirmed > Processing | PASS | |
| 5.5 | Status change: Processing > Ready | PASS | |
| 5.6 | Status change: Ready > Shipped | PASS | |
| 5.7 | Status change: Shipped > Delivered | PASS | |
| 5.8 | Activity Log records each status transition | PASS | "Order status changed X > Y" entries |
| 5.9 | No-op status change NOT logged (fix #75) | PASS | Saving edit without status change does not create "X > X" entry |

---

### 6. Record Payment

| # | Test | Result | Notes |
|---|---|---|---|
| 6.1 | "Record Payment" button opens dialog | PASS | Full dialog renders |
| 6.2 | Dialog shows: Total Amount, Already Paid, Balance Due | PASS | Correct calculations |
| 6.3 | Quick amount buttons: 25%, 50%, Full | PASS | "Full" fills exact balance due |
| 6.4 | ILS conversion shown | PASS | Approximate ILS equivalent displayed |
| 6.5 | Payment method dropdown: Cash, Credit Card, Bank Transfer, Check, Other | PASS | All options present |
| 6.6 | Submit partial payment | PASS | Toast: "Payment recorded successfully" |
| 6.7 | Payment Status updates to "Partial" | PASS | Badge shows partial state |
| 6.8 | Submit remaining balance (full payment) | PASS | |
| 6.9 | Payment Status updates to "Paid" | PASS | Green "Paid" badge |
| 6.10 | "Fully Paid" indicator displayed | PASS | Checkmark icon with "Fully Paid" text |
| 6.11 | Payment method retained on order | PASS | Persisted after reload |
| 6.12 | Payment logged to Activity Log (fix #65) | PASS | "Payment recorded" entry with amount, method, resulting status |
| 6.13 | Payment auto-recalculates when total changes (fix #48) | PASS | Adding items after full payment changes status to "Partial" with updated balance |
| 6.14 | Overpaid status when total reduced below paid amount (fix #73) | PASS | Blue "Overpaid" badge with overpaid amount shown |

---

### 7. Edit Order

| # | Test | Result | Notes |
|---|---|---|---|
| 7.1 | "Edit" button opens edit form | PASS | Breadcrumb: Dashboard > Orders > ORD-... > Edit |
| 7.2 | Status & Payment dropdowns show current values | PASS | Pre-filled, editable |
| 7.3 | Items table renders with current items | PASS | All order items listed |
| 7.4 | "Add" / "Scan" buttons to add items during edit | PASS | Product selection dialog works |
| 7.5 | Remove item from order (trash icon) | PASS | Item removed from list |
| 7.6 | Custom item quantity editable (spinbutton) | PASS | Click quantity activates spinbutton |
| 7.7 | Inventory item quantity shows "Fixed" | PASS | DN-specific items not quantity-editable |
| 7.8 | Change quantity: live total updates | PASS | Row total and order total recalculate in real-time |
| 7.9 | "Item updated" optimistic toast on spinbutton blur | PASS | |
| 7.10 | Edit quantity persists after Save + reload | PASS | Confirmed correct values post-reload |
| 7.11 | Customer info editable (Name, Phone, Email, Address) | PASS | |
| 7.12 | Delivery method / address editable | PASS | |
| 7.13 | Notes fields: Internal Notes + Customer Notes | PASS | Both textareas present |
| 7.14 | Order discount field (% spinbutton) | PASS | Applies to entire order total |
| 7.15 | "Order updated successfully" toast on Save | PASS | |
| 7.16 | Payment status auto-recalculates on total change (fix #48) | PASS | Partial/Paid/Overpaid updates correctly |
| 7.17 | Stale data flash after save navigation | WARN | ~500ms flash of old values before refetch completes; data corrects after |

---

### 8. Activity Log & Discussions

| # | Test | Result | Notes |
|---|---|---|---|
| 8.1 | Activity Log section on order detail | PASS | Timeline of events rendered |
| 8.2 | Activity Log: order creation recorded | PASS | "Order created" entry with timestamp and user |
| 8.3 | Activity Log: status changes recorded | PASS | "Order status changed X > Y" for each transition |
| 8.4 | Activity Log: payment recorded (fix #65) | PASS | "Payment recorded" with amount, method, new status |
| 8.5 | Activity Log: item edits recorded | PASS | "Order items updated" entry |
| 8.6 | Activity Log: no-op status NOT recorded (fix #75) | PASS | Guard prevents "X > X" entries |
| 8.7 | Documents & Discussions section | PASS | Open/Resolved tabs with empty state "No threads yet" |
| 8.8 | "New Thread" button opens creation dialog | PASS | Related to order #, Title, Description, Attachments |
| 8.9 | Create thread on order | PASS | Toast: "Thread created successfully"; thread appears in Open tab |
| 8.10 | Thread linked to order context | PASS | Thread shows order reference |

---

### 9. Date Filter in Orders (fix #67)

| # | Test | Result | Notes |
|---|---|---|---|
| 9.1 | Open Filters panel | PASS | Panel shows all filter fields |
| 9.2 | Start Date filter field present (type="date") | PASS | Date picker input rendered (fix #67) |
| 9.3 | End Date filter field present (type="date") | PASS | Date picker input rendered (fix #67) |
| 9.4 | Set Start Date — orders filtered to on/after date | PASS | List updates correctly |
| 9.5 | Set End Date — orders filtered to on/before date | PASS | List updates correctly |
| 9.6 | Set both Start + End Date — date range filter | PASS | Only orders within range shown |
| 9.7 | Clear filters removes date constraints | PASS | Full list restored |
| 9.8 | URL state reflects date params (startDate, endDate) | PASS | Params in URL for shareability |

---

## Defects & Observations

### WARN-01 — Card View "No Orders Description" Placeholder (unchanged)
- **Where:** Orders page, Card view toggle, empty state
- **Actual:** Shows literal "No Orders Description" text
- **Expected:** Translated empty state description
- **Impact:** Low. Missing i18n key.

### WARN-02 — Broken Product Images in Selection Dialog (unchanged)
- **Where:** Create Order / Edit Order, product selection dialog
- **Actual:** Multiple broken images (external valigara.com CDN URLs unreachable)
- **Impact:** Medium. Products without images harder to identify. External CDN issue, not app bug.

### WARN-03 — Stale Data Flash After Save Redirect (unchanged)
- **Where:** Edit Order > Save > redirect to detail view
- **Actual:** Old quantity/total briefly visible for ~500ms before refetch corrects values
- **Root Cause:** `queryClient.invalidateQueries()` and `router.push()` fire simultaneously; page mounts with stale SSR initialData before refetch completes
- **Impact:** Low. Data is correct after refetch. UX confusion only.

---

## Test Coverage Summary

| Section | Tests | Pass | Fail | Warn |
|---|---|---|---|---|
| Authentication | 1 | 1 | 0 | 0 |
| Orders List UI & Navigation | 11 | 10 | 0 | 1 |
| Create Order — New Customer Flow | 14 | 13 | 0 | 1 |
| Order Detail Page | 14 | 14 | 0 | 0 |
| Status Management | 9 | 9 | 0 | 0 |
| Record Payment | 14 | 14 | 0 | 0 |
| Edit Order | 17 | 16 | 0 | 1 |
| Activity Log & Discussions | 10 | 10 | 0 | 0 |
| Date Filter in Orders | 8 | 8 | 0 | 0 |
| **TOTAL** | **98** | **95** | **0** | **3** |

---

SUMMARY: Passed: 95 | Failed: 0 | Warnings: 3
