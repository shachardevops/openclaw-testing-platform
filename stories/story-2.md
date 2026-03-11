# QA Report — Story 2: Admin Manages Buyer's Order

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

## Scope

Complete admin order lifecycle: authentication, list/search/filter, create order (new + existing customer), order detail page, status transitions, payment recording, payment status types, edit order, cancel, delete, mark as delivered, activity log, and order threads.

---

## 1. Authentication

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.1.1 | Navigate to `/en/admin` without session | Redirect to `/en/auth/login` | |
| 2.1.2 | Login with test@example.com / 121212 | Redirect to admin dashboard | |
| 2.1.3 | Admin role verified | Dashboard loads with full nav, no buyer/supplier redirect | |

---

## 2. Orders List (`/en/admin/orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.2.1 | Orders page loads | Table with columns: Order #, Customer, Date, Items, Total, Status, Payment | |
| 2.2.2 | Search by order number (e.g., "ORD-202603") | Live filter, matching orders shown | |
| 2.2.3 | Search by customer name | Matching customer orders shown | |
| 2.2.4 | Status filter dropdown | Options: Pending, Confirmed, Processing, Ready, Shipped, Delivered, Cancelled, Returned | |
| 2.2.5 | Payment status filter dropdown | Options: Pending, Partial, Paid, Overpaid | |
| 2.2.6 | Start Date filter | Date input renders, filters orders from that date (fix #67) | |
| 2.2.7 | End Date filter | Date input renders, filters orders up to that date (fix #67) | |
| 2.2.8 | Combined date + status filter | Both filters applied simultaneously | |
| 2.2.9 | Table view renders correctly | Columns, rows, pagination, row selection checkboxes | |
| 2.2.10 | Card view toggle | Click toggle, card layout renders with order info | |
| 2.2.11 | Card view shows correct item count | Total quantity, not item row count (fix #37) | |
| 2.2.12 | Card view empty state | "No orders found" message when filters yield no results | |
| 2.2.13 | "Add Order" button present | Navigates to `/en/admin/orders/new` | |
| 2.2.14 | Pagination controls | Next/Prev/Page numbers, 20 per page | |

---

## 3. Create Order -- New Customer (`/en/admin/orders/new`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.3.1 | Create Order form loads | Customer section, Delivery section, Items section, Summary | |
| 2.3.2 | Customer Type toggle: New / Existing | Toggle present, default "New" | |
| 2.3.3 | New Customer fields | Name, Email, Phone, Company (all editable) | |
| 2.3.4 | Delivery Method radio buttons | Delivery, Pickup, Shipping options | |
| 2.3.5 | Select Pickup delivery method | Address fields hidden or optional | |
| 2.3.6 | Select Delivery method | Address fields appear (Street, City, Country) | |
| 2.3.7 | "Add" button opens product selection dialog | Product search dialog with category tabs | |
| 2.3.8 | Product search in dialog | Search by product name or code, results filter live | |
| 2.3.9 | Category filter tabs in dialog | All, Rings, Earrings, Bangles, Bracelets, etc. | |
| 2.3.10 | Select product shows inventory options | "From Stock" tab with DN-coded items, "To Order" tab | |
| 2.3.11 | Add inventory item (From Stock) | Item added to order table with DN code, specs, price | |
| 2.3.12 | Add custom item (To Order / Made to Order) | Item added with quantity selector and price input | |
| 2.3.13 | Remove item button (Trash icon) | Item removed, does not trigger form submit (fix #63: `type="button"`) | |
| 2.3.14 | Order summary live update | Total recalculates as items added/removed | |
| 2.3.15 | "Create Order" button disabled until required fields filled | Button enables after customer name + at least 1 item | |
| 2.3.16 | Submit Create Order | Toast: "Order created successfully", redirect to order detail | |
| 2.3.17 | Order number assigned | Format: ORD-YYYYMM-NNNNN | |
| 2.3.18 | Redirect to order detail page | `/en/admin/orders/{uuid}` with correct data | |

---

## 4. Create Order -- Existing Customer

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.4.1 | Toggle to "Existing" customer | Customer search field appears | |
| 2.4.2 | Search for existing customer by name | Dropdown with matching customers | |
| 2.4.3 | Select existing customer | Name, Email, Phone pre-filled from customer record | |
| 2.4.4 | Pre-filled fields editable | Can override pre-filled values | |
| 2.4.5 | Complete order with existing customer | Order created, customer linked | |

---

## 5. Order Detail Page (`/en/admin/orders/{id}`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.5.1 | Order detail page loads | Full order view with all sections | |
| 2.5.2 | Order number displayed in header | e.g., ORD-202603-00002 | |
| 2.5.3 | Order creation date displayed | Formatted date | |
| 2.5.4 | Status badge in header | Colored badge: Pending (yellow), Confirmed (blue), etc. | |
| 2.5.5 | Payment status badge | Colored badge matching current payment state | |
| 2.5.6 | Progress timeline | Visual steps: Pending > Confirmed > Processing > Ready > Shipped > Delivered | |
| 2.5.7 | Timeline highlights current step | Active step highlighted, completed steps marked | |
| 2.5.8 | Items list with product details | Product name, SKU, DN code (if from stock), quantity, price | |
| 2.5.9 | Item specs displayed | Metal type, ring size, weight, stone info where applicable | |
| 2.5.10 | Material totals section | Gold weight total, stone carats total (if applicable) | |
| 2.5.11 | Order summary | Subtotal, Discount (if any), Final Price | |
| 2.5.12 | Customer info sidebar | Name, Email, Phone, Company | |
| 2.5.13 | Delivery info sidebar | Method, Address (if delivery/shipping) | |
| 2.5.14 | Activity Log section | Shows chronological activity entries | |
| 2.5.15 | Documents & Discussions section | "New Thread" button, Open/Resolved tabs | |
| 2.5.16 | "..." (more) menu in header | Contains: Print, Mark as Delivered (if shipped), Cancel, Delete (fix #46) | |
| 2.5.17 | "Edit" button in header | Navigates to edit order form | |
| 2.5.18 | "Record Payment" button | Opens payment dialog | |

---

## 6. Status Management

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.6.1 | Status dropdown on order detail | Shows all available status options | |
| 2.6.2 | Pending to Confirmed | Toast: "Order status updated successfully", timeline updates | |
| 2.6.3 | Confirmed to Processing | Toast + timeline update | |
| 2.6.4 | Processing to Ready | Toast + timeline update | |
| 2.6.5 | Ready to Shipped | Toast + timeline update | |
| 2.6.6 | Shipped to Delivered | Toast + timeline update, delivery date recorded | |
| 2.6.7 | Activity log records each status change | Entry: "Status changed from X to Y" (fix #66) | |
| 2.6.8 | No-op status change filtered | Selecting same status does not create activity log entry (fix #75) | |
| 2.6.9 | Cancel status shows confirmation dialog | "Are you sure you want to cancel this order?" with warning text | |
| 2.6.10 | Cancel confirmation required | Must click confirm button; cancel button dismisses dialog | |
| 2.6.11 | Status dropdown includes all options | Pending, Confirmed, Processing, Ready, Shipped, Delivered, Cancelled, Returned | |

---

## 7. Record Payment

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.7.1 | "Record Payment" opens dialog | Payment dialog renders | |
| 2.7.2 | Dialog shows Total, Already Paid, Balance Due | Correct amounts from order | |
| 2.7.3 | 25% quick amount button | Pre-fills 25% of balance due | |
| 2.7.4 | 50% quick amount button | Pre-fills 50% of balance due | |
| 2.7.5 | Full quick amount button | Pre-fills full balance due | |
| 2.7.6 | ILS conversion toggle | USD/ILS toggle, converts amount at exchange rate | |
| 2.7.7 | Payment method dropdown | Cash, Credit Card, Bank Transfer, Check, Other | |
| 2.7.8 | Submit partial payment (25%) | Toast: "Payment recorded successfully" | |
| 2.7.9 | Payment status updates to Partial | Orange "Partial" badge shown | |
| 2.7.10 | Record remaining balance | Submit second payment for remaining amount | |
| 2.7.11 | Payment status updates to Paid | Green "Paid" badge shown | |
| 2.7.12 | "Fully Paid" indicator displayed | Badge or label in payment section | |
| 2.7.13 | Activity log records payment | Entry with amount, method, resulting status (fix #65) | |

---

## 8. Payment Status Types

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.8.1 | Pending payment status | Yellow badge, $0 paid, full balance due | |
| 2.8.2 | Partial payment status | Orange badge, partial amount paid, remaining balance shown | |
| 2.8.3 | Paid payment status | Green badge, full amount paid, $0 balance | |
| 2.8.4 | Overpaid payment status | Blue "Overpaid" badge (fix #73) | Triggered when order edited to reduce price below paid_amount |
| 2.8.5 | Overpaid scenario: edit order to remove items after full payment | Payment status changes from Paid to Overpaid | |
| 2.8.6 | Overpaid amount displayed | Shows excess amount in payment summary (fix #73) | |
| 2.8.7 | Overpaid badge color is blue | Distinct from Paid (green) and Partial (orange) | |

---

## 9. Edit Order (`/en/admin/orders/{id}/edit`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.9.1 | "Edit" button navigates to edit form | Edit form loads with current order data | |
| 2.9.2 | Existing items displayed in table | Product, SKU, DN, Quantity, Price | |
| 2.9.3 | Add new item via "Add" button | Product search dialog opens, item added | |
| 2.9.4 | Remove existing item | Trash icon removes item from table | |
| 2.9.5 | Edit quantity on existing item | Quantity stepper or input updates value | |
| 2.9.6 | Price recalculates on item changes | Subtotal and Final Price update live | |
| 2.9.7 | Save edited order | Toast: "Order updated successfully" | |
| 2.9.8 | Changes persist after save | Navigating back to detail shows updated items and totals | |
| 2.9.9 | Payment status auto-recalculates on price change | If paid_amount > new final_price, status becomes Overpaid (fix #48) | |
| 2.9.10 | Payment status recalculates: adding items to paid order | Paid to Partial if new total exceeds paid amount (fix #45) | |

---

## 10. Cancel Order

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.10.1 | Cancel via status dropdown | Confirmation dialog appears | |
| 2.10.2 | Confirmation dialog text | Warning about inventory impact, irreversibility | |
| 2.10.3 | Confirm cancellation | Status changes to Cancelled, red badge | |
| 2.10.4 | Inventory impact warning | Dialog mentions potential inventory effect for stock items | |
| 2.10.5 | Cancelled order badge | Red "Cancelled" badge in header and list | |
| 2.10.6 | Timeline shows cancellation | X icon at cancellation point with date | |
| 2.10.7 | Items remain visible | Order items still displayed on cancelled order | |
| 2.10.8 | Activity log records cancellation | Entry: "Status changed from X to Cancelled" | |

---

## 11. Delete Order

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.11.1 | Delete option in "..." menu | Present for Pending/Cancelled/Returned orders (fix #46) | |
| 2.11.2 | Delete confirmation dialog | "Are you sure?" with deletion preview | |
| 2.11.3 | Optional deletion reason | Text input for reason | |
| 2.11.4 | Confirm deletion | Toast: "Order deleted successfully" | |
| 2.11.5 | Redirect after delete | Navigates back to orders list | |
| 2.11.6 | Deleted order appears in Trash | `/en/admin/trash` shows the deleted order | |

---

## 12. Mark as Delivered

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.12.1 | "Mark as Delivered" in "..." menu | Visible only when order status is Shipped (fix #46) | |
| 2.12.2 | Click Mark as Delivered | Status changes to Delivered | |
| 2.12.3 | Timeline updates to Delivered | Delivered step highlighted with date | |
| 2.12.4 | Inventory impact for stock items | Items marked as Sold at destination | |
| 2.12.5 | Activity log records delivery | Entry: "Status changed from Shipped to Delivered" | |

---

## 13. Activity Log on Order Detail

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.13.1 | Activity log section visible on order detail | Chronological list of events | |
| 2.13.2 | Order creation logged | Entry on creation with order number (fix #25) | |
| 2.13.3 | Status changes logged | Each transition recorded with from/to values (fix #66) | |
| 2.13.4 | Payment recorded logged | Entry with amount, method, new total (fix #65) | |
| 2.13.5 | Item edits logged | Adding/removing items creates log entries | |
| 2.13.6 | No duplicate/no-op entries | Same-status changes filtered, no spurious payment entries (fix #75, #64) | |
| 2.13.7 | Activity log entries show performer name | User who performed the action displayed | |
| 2.13.8 | Activity log entries show timestamp | Date and time of each event | |

---

## 14. Order Threads (Documents & Discussions)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 2.14.1 | "New Thread" button in Documents & Discussions | Button visible and clickable | |
| 2.14.2 | Create thread dialog | Title and Description fields, rich text editor | |
| 2.14.3 | Submit new thread | Toast: "Thread created successfully" | |
| 2.14.4 | Thread appears in Open tab | New thread listed under Open threads | |
| 2.14.5 | Thread linked to order | Thread entity_type is "order", entity_id matches | |
| 2.14.6 | Thread detail loads at `/en/admin/inbox/{id}` | Thread content with comments (fix #71) | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 108 |
| **Passed** | -- |
| **Failed** | -- |
| **Warnings** | -- |
