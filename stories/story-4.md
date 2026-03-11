# QA Report — Story 4: Distributor Sells & Returns

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** Distributor: distributor@example.com / 121212 | Admin: test@example.com / 121212

## Scope

Full end-to-end distributor lifecycle: admin creates consignment shipment, distributor dashboard and inventory, report sale, inventory status after sale, return unsold items, catalog and cart, order checkout, distributor orders page, reports, inbox and messaging, and admin cross-verification.

---

## 1. Pre-Flight: Admin Creates Consignment Shipment

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.1.1 | Login as admin (test@example.com / 121212) | Admin dashboard loads | |
| 4.1.2 | Navigate to `/en/admin/shipments/new` | Create Shipment form loads | |
| 4.1.3 | Select From Location: Main Warehouse | Location dropdown, warehouse selected | |
| 4.1.4 | Select To Location: Distributor Showroom | Distributor location selected | |
| 4.1.5 | Add items via barcode scan or search | DN codes entered, items added with toast "Added: DNxxxxx" | |
| 4.1.6 | Add 3 items (e.g., DN00001, DN00002, DN00003) | All 3 appear in shipment items list | |
| 4.1.7 | Summary shows correct count and value | "3 items, 3 Products, Value $X,XXX.XX" | |
| 4.1.8 | Create Shipment | Toast: "Shipment created", SHP number assigned | |
| 4.1.9 | Ship action (Pending to In Transit) | Confirmation dialog, confirm, Toast: "Shipment marked as shipped" | |
| 4.1.10 | Mark as Delivered (In Transit to Delivered) | Confirmation dialog, confirm, Toast: "Shipment marked as delivered" | |
| 4.1.11 | Admin inventory confirms items at Distributor Showroom | All 3 items show "Available" at distributor location | |

---

## 2. Distributor Dashboard (`/en/distributor`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.2.1 | Login as distributor@example.com / 121212 | Redirect to distributor portal | |
| 4.2.2 | Dashboard loads | Greeting, counters, quick actions, materials summary | |
| 4.2.3 | "In Stock" counter | Shows count of available items at distributor location | |
| 4.2.4 | "Sold" counter | Shows count of sold items (0 if fresh consignment) | |
| 4.2.5 | "Gold" weight counter | Sum of gold weights across all items (g) | |
| 4.2.6 | "Diamonds" carat counter | Sum of diamond carats (0.00ct if no stones) | |
| 4.2.7 | Quick Actions links | Report Sale, Reports, Inventory, Catalog -- all functional | |
| 4.2.8 | Materials Summary table | Renders with material breakdown | |
| 4.2.9 | Recent Threads section | Shows threads or "No threads yet" empty state | |

---

## 3. Distributor Inventory (`/en/distributor/inventory`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.3.1 | Inventory page loads | Items list with columns | |
| 4.3.2 | All consigned items visible | Each DN code with product name, weight, status | |
| 4.3.3 | Status badges: "Available" for all items | Green Available badge on each item | |
| 4.3.4 | "Filters" button accessible | Opens filter panel | |
| 4.3.5 | Row count correct | "0 of N row(s) selected" matches item count | |
| 4.3.6 | Item details displayed | Product type, SKU, gold weight per item | |

---

## 4. Report Sale (`/en/distributor/report-sale`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.4.1 | Report Sale page loads | Available items list with checkboxes | |
| 4.4.2 | All available items visible | Only items with Available status shown | |
| 4.4.3 | Select first item checkbox | Checkbox toggles, selection count updates | |
| 4.4.4 | Select second item checkbox | Selection count increments | |
| 4.4.5 | "N items selected" badge appears | Shows correct count of selected items | |
| 4.4.6 | "Mark as Sold" button appears | Enabled when items selected | |
| 4.4.7 | Click "Mark as Sold" | Confirmation dialog: "Are you sure you want to mark N item(s) as sold?" | |
| 4.4.8 | Confirm sale | Toast: "N items marked as sold" | |
| 4.4.9 | Sold items removed from Report Sale list | Only unsold items remain | |

---

## 5. Inventory Status After Sale

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.5.1 | Distributor inventory: sold item 1 shows "Sold" | Status badge changes to Sold | |
| 4.5.2 | Distributor inventory: sold item 2 shows "Sold" | Status badge changes to Sold | |
| 4.5.3 | Distributor inventory: unsold item shows "Available" | Status unchanged | |
| 4.5.4 | Admin inventory: sold item 1 at Distributor Showroom = "Sold" | Admin sees same status | |
| 4.5.5 | Admin inventory: sold item 2 at Distributor Showroom = "Sold" | Admin sees same status | |
| 4.5.6 | Dashboard "Sold" counter updates | Reflects number of sold items | |
| 4.5.7 | Dashboard "In Stock" counter decreases | Reflects remaining available items | |

---

## 6. Return Unsold Items

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.6.1 | Navigate to distributor inventory | Available items visible | |
| 4.6.2 | Select available item checkbox | Item selected, selection count shows | |
| 4.6.3 | "N available item(s) selected" indicator | Correct count shown | |
| 4.6.4 | "Add to Return Cart" button appears | Button visible when available items selected | |
| 4.6.5 | Click "Add to Return Cart" | Toast: "N item(s) added to return cart" | |
| 4.6.6 | Cart icon badge increments | Badge reflects return items added | |
| 4.6.7 | Open cart dialog | Cart dialog opens | |
| 4.6.8 | "Returns" tab available | Tab shows with return item count | |
| 4.6.9 | Returns tab shows correct items | Product name, DN code, weight per item | |
| 4.6.10 | Optional notes field in return cart | Textarea for return notes | |
| 4.6.11 | "Submit Return (N)" button | Button shows count of return items | |
| 4.6.12 | Click Submit Return | Confirmation dialog: "Are you sure you want to return N item(s) to the warehouse?" | |
| 4.6.13 | Confirm return | Toast: "Return shipment SHP-XXXXXX-XXXX created (N items)" | |
| 4.6.14 | Return shipment created | Shipment with type: Return, direction: Distributor > Warehouse | |

---

## 7. Catalog & Cart (`/en/distributor/catalog`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.7.1 | Catalog page loads | Product grid with pagination | |
| 4.7.2 | Product count and page count displayed | "Showing X of Y products", Z pages | |
| 4.7.3 | Recently Viewed section | Previously browsed products shown | |
| 4.7.4 | Add product to cart | Click "Add to Cart" button on product | |
| 4.7.5 | Add to cart toast | Toast: "Added to cart" | |
| 4.7.6 | Button updates to show cart quantity | "Add to Cart (1)" | |
| 4.7.7 | Cart badge increments | Badge on cart icon shows count | |
| 4.7.8 | Open cart dialog | Click cart icon, dialog opens | |
| 4.7.9 | "Orders" tab shows cart items | Items with name, price, quantity | |
| 4.7.10 | "Returns" tab shows return items (if any) | Separate tab from orders | |
| 4.7.11 | Cart total calculation | Sum of (price x qty) for all order items | |
| 4.7.12 | "Saved for Later" section | Shows saved items from previous sessions | |
| 4.7.13 | "Proceed to Checkout" button | Visible when items in cart | |

---

## 8. Order Checkout & Placement

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.8.1 | Click "Proceed to Checkout" | "Complete Your Order" dialog opens | |
| 4.8.2 | Order Summary shows items and total | Correct items, prices, total amount | |
| 4.8.3 | Delivery method radio buttons | Delivery, Pickup, Shipping -- all present | |
| 4.8.4 | Address pre-filled for returning customer | Name, Phone, Street, City, Country from previous order | |
| 4.8.5 | Address editable | Can modify pre-filled address fields | |
| 4.8.6 | "Place Order" button | Present and clickable | |
| 4.8.7 | Submit order | Toast: "Order placed successfully!" | |
| 4.8.8 | Cart cleared after placement | Cart badge disappears, cart dialog shows empty | |
| 4.8.9 | Order number assigned | Format: ORD-YYYYMM-NNNNN | |

---

## 9. Distributor Orders Page (`/en/distributor/orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.9.1 | Orders page loads | Table with order columns | |
| 4.9.2 | New order appears in list | Order number, date, item count, total | |
| 4.9.3 | Status: Pending | Pending badge on new order | |
| 4.9.4 | Payment: Pending | Pending payment badge | |
| 4.9.5 | View order detail link | Navigates to `/en/distributor/orders/{uuid}` | |
| 4.9.6 | Order detail page loads | Items, delivery info, status, payment status | |

---

## 10. Reports (`/en/distributor/reports`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.10.1 | Reports page loads | Gold weight breakdown, material summary | |
| 4.10.2 | "In Stock" gold weight | Weight of available items (g) | |
| 4.10.3 | "Sold" gold weight | Weight of sold items (g) | |
| 4.10.4 | Gold weight math consistency | In Stock + Sold = Total consigned weight (minus returned) | |
| 4.10.5 | Diamond carats reported (if applicable) | Correct carat totals by status | |

---

## 11. Inbox & Messaging (`/en/distributor/inbox`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.11.1 | Inbox page loads | Thread list or "No threads found" | |
| 4.11.2 | "New Thread" button visible | Button present (fix #44) | |
| 4.11.3 | Create New Thread dialog | Title and Description fields | |
| 4.11.4 | Submit thread: "QA Test Thread" | Toast: "Thread created successfully" | |
| 4.11.5 | Thread appears in distributor inbox | Listed with "less than a minute ago" timestamp | |
| 4.11.6 | Thread detail at `/en/distributor/inbox/{id}` | Thread content renders (fix #71: moved from /threads/) | |
| 4.11.7 | Admin inbox shows same thread | Login as admin, navigate to `/en/admin/inbox`, thread visible | |
| 4.11.8 | Cross-user thread visibility confirmed | Both distributor and admin can see and reply to thread | |

---

## 12. Admin Cross-Verification

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 4.12.1 | Admin orders list shows distributor order | Order for "Test Distributor User" with correct items and total | |
| 4.12.2 | Admin order detail matches distributor submission | Items, delivery method, address, total all correct | |
| 4.12.3 | Admin shipments list shows return shipment | Type: Return, Source: Distributor Showroom, Destination: Warehouse, Status: Pending | |
| 4.12.4 | Return shipment item count correct | Matches items submitted in return cart | |
| 4.12.5 | Return shipment notes | "Return from distributor" or custom notes | |
| 4.12.6 | Admin inventory at Distributor Showroom | Shows all items with correct statuses (Available, Sold) | |
| 4.12.7 | Admin can Ship return shipment | Pending to In Transit transition works | |
| 4.12.8 | Admin can Deliver return shipment | In Transit to Delivered, items returned to warehouse inventory | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 103 |
| **Passed** | -- |
| **Failed** | -- |
| **Warnings** | -- |
