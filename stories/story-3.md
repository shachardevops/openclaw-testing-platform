# QA Report — Story 3: Supplier Manufactures and Delivers

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** Admin: test@example.com / 121212 | Supplier: supplier@example.com / 121212

## Scope

Full end-to-end supplier lifecycle: admin creates supplier order (Draft to Sent), supplier dashboard and orders, supplier transactions with material validation, supplier intake, supplier shipment creation, supplier inventory/profile/inbox, admin receives shipment, and admin supplier order lifecycle through all states.

---

## 1. Admin: Create Supplier Order (`/en/admin/supplier-orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.1.1 | Navigate to `/en/admin/supplier-orders` | Supplier orders list loads | |
| 3.1.2 | "Create Order" button present | Navigates to `/en/admin/supplier-orders/new` | |
| 3.1.3 | Supplier Order form loads | Supplier selection, Items section, Notes, Ship To | |
| 3.1.4 | Supplier selection dropdown | List of supplier locations | |
| 3.1.5 | Recent supplier chips displayed | Quick-select chips for recently used suppliers (fix #112) | |
| 3.1.6 | Click recent supplier chip | Supplier field populated, form marked dirty (`shouldDirty: true`, fix #112) | |
| 3.1.7 | Add items to supplier order | Product search, quantity per item, base product selection | |
| 3.1.8 | Ship To destination selection | Warehouse/location dropdown | |
| 3.1.9 | Notes section collapsible | ChevronRight toggles, RTL rotation correct (fix #111) | |
| 3.1.10 | Submit Draft order | Toast: "Supplier order created", redirect to detail page with locale prefix (fix #110) | |
| 3.1.11 | Order number assigned | Format: SO-YYYYMM-NNNNN | |
| 3.1.12 | Draft status displayed | Progress tracker: Draft (active) > Sent > In Progress > Shipped > Completed | |
| 3.1.13 | "Send to Supplier" action | Toast: "Order sent to supplier", status changes to Sent | |
| 3.1.14 | Progress tracker updates to Sent | Sent step highlighted with date | |

---

## 2. Supplier Dashboard (`/en/supplier`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.2.1 | Login as supplier@example.com / 121212 | Redirect to supplier portal | |
| 3.2.2 | Supplier dashboard loads | Greeting, material balances, quick actions | |
| 3.2.3 | Material balances displayed | Funds ($), Gold (g), Platinum (g), Stones (ct) | |
| 3.2.4 | Notification badge | Shows count of items needing attention | |
| 3.2.5 | Quick action links render | Orders, Transactions, Intake, Shipments, Inventory, Profile | |
| 3.2.6 | Recent Threads section | Shows threads or "No threads yet" empty state | |

---

## 3. Supplier Orders (`/en/supplier/orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.3.1 | Supplier orders page loads | Table with order columns | |
| 3.3.2 | Sent order visible | SO number, item count, Pending status (supplier-side mapping) | |
| 3.3.3 | Notification badge on orders | "N Notifications" badge when new orders arrive | |
| 3.3.4 | Click order row to open detail | Order detail page loads with items, fulfillment tracker, ship-to, status | |
| 3.3.5 | Order items displayed | Product name, quantity, specs | |
| 3.3.6 | Fulfillment progress tracker | Visual steps matching order state | |
| 3.3.7 | "Start Work" button | Transitions order to In Progress | |
| 3.3.8 | Start Work confirmation | Toast: "Order status updated successfully" | |
| 3.3.9 | Status updates to In Progress | Progress tracker reflects new state | |

---

## 4. Supplier Transactions (`/en/supplier/transactions`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.4.1 | Transactions page loads | Balance summary, transaction history, "Add Transaction" button | |
| 3.4.2 | Balance summary displayed | Funds (USD), Pure Gold (g), Pure Platinum (g) | |
| 3.4.3 | Transaction history table | Date, Type, Description, Amount columns | |
| 3.4.4 | "Add Transaction" button menu | 4 options: Purchase Materials, Record Material Usage, Record Labor Cost, Manual Adjustment | |
| 3.4.5 | Purchase Materials dialog | Material Type, Purity, Amount, Cost, Description fields | |
| 3.4.6 | Material purchase validation: insufficient funds | Error: "Insufficient USD. Current: X, Required: Y" -- correctly rejected | |
| 3.4.7 | Valid material purchase (with sufficient funds) | Transaction recorded, balances updated | |
| 3.4.8 | Record Material Usage dialog | Material Type, Amount, linked order selection | |
| 3.4.9 | Record Labor Cost dialog | Amount, Description fields | |

---

## 5. Supplier Intake (`/en/supplier/intake`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.5.1 | Intake page loads | Intake Documents list with "Record Items" button | |
| 3.5.2 | Items from In Progress order visible | Items listed for the active supplier order | |
| 3.5.3 | "Add Unit" for each item | Per-unit recording form expands | |
| 3.5.4 | Unit detail fields | Gross Weight, Purity, additional specs per unit | |
| 3.5.5 | Fill in item details | Weight, purity values accepted | |
| 3.5.6 | Submit intake form | Toast: "Items recorded successfully" | |
| 3.5.7 | Intake document number assigned | Format: INK-YYMMDD-NNNN | |
| 3.5.8 | Intake document listed in history | Number, date, item count, linked supplier order | |
| 3.5.9 | DN numbers assigned to items | Each recorded unit gets a DN code | |

---

## 6. Supplier Shipment Creation (`/en/supplier/shipments`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.6.1 | Shipments page loads | Shipments list with "Create Shipment" button | |
| 3.6.2 | "Create Shipment" opens wizard | Multi-step wizard flow | |
| 3.6.3 | Step 1: Select items | Intake items grouped by supplier order, checkboxes to select | |
| 3.6.4 | Select all intake items | All DN-coded items from intake selected | |
| 3.6.5 | Step 2: Select destination | Warehouse/location dropdown (e.g., "Main Warehouse") | |
| 3.6.6 | Step 3: Confirm shipment | Summary: item count, destination, source | |
| 3.6.7 | Submit shipment | Toast: "Shipment created", shipment number assigned | |
| 3.6.8 | Shipment number format | SOS-YYYYMM-NNNNN | |
| 3.6.9 | Shipment status: Pending | Listed as Outbound, Pending | |

---

## 7. Supplier Inventory / Profile / Inbox

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.7.1 | `/en/supplier/inventory` loads | Gold, Platinum, Stones, Finished Products balances | |
| 3.7.2 | Inventory balances reflect transactions | Values match after purchases and usage | |
| 3.7.3 | `/en/supplier/profile` loads | User name, email, role: Supplier | |
| 3.7.4 | Profile shows supplier organization | Organization name, notification preferences (4 toggles) | |
| 3.7.5 | `/en/supplier/inbox` loads | Thread list or empty state with search and filter | |
| 3.7.6 | "New Thread" button | Opens creation dialog (fix #44) | |
| 3.7.7 | Create thread from supplier | Toast: "Thread created successfully" | |
| 3.7.8 | Thread visible in supplier inbox | Shows with timestamp | |
| 3.7.9 | Thread visible in admin inbox | Cross-user visibility confirmed | |
| 3.7.10 | User context isolation | All data scoped to supplier user/org | |

---

## 8. Admin Receives Shipment (`/en/admin/shipments`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.8.1 | Supplier shipment visible in admin shipments list | SOS number, type "Supplier Order", source > destination | |
| 3.8.2 | Shipment source/destination correct | Supplier location > Main Warehouse (or selected destination) | |
| 3.8.3 | Shipment item count correct | Matches items shipped by supplier | |
| 3.8.4 | "Ship" quick action (Pending to In Transit) | Confirmation dialog shown | |
| 3.8.5 | Confirm Ship action | Toast: "Shipment marked as shipped", status: In Transit | |
| 3.8.6 | "Mark as Delivered" action (In Transit to Delivered) | Confirmation dialog shown | |
| 3.8.7 | Confirm delivery | Toast: "Shipment marked as delivered" | |
| 3.8.8 | Delivered At timestamp recorded | Date displayed in Delivered At column | |
| 3.8.9 | Inventory item 1 at destination warehouse | DN code, Status: Available, Location: destination | |
| 3.8.10 | Inventory item 2 at destination warehouse | DN code, Status: Available, Location: destination | |
| 3.8.11 | Inventory item 3 at destination warehouse | DN code, Status: Available, Location: destination | |
| 3.8.12 | Activity log records shipment status changes | Ship and Deliver entries in activity log (fix #26) | |

---

## 9. Admin Supplier Order Lifecycle (`/en/admin/supplier-orders/{id}`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 3.9.1 | Supplier orders list shows the order | SO number, supplier name, item count, current status | |
| 3.9.2 | Draft status on creation | Progress: Draft (active) | |
| 3.9.3 | Draft to Sent ("Send to Supplier") | Toast: "Order sent to supplier", progress updates | |
| 3.9.4 | Sent to In Progress | Automatic when supplier starts work, progress updates | |
| 3.9.5 | In Progress to Shipped | When supplier creates shipment, progress updates | |
| 3.9.6 | Shipped to Completed | When admin receives and delivers shipment, order completes | |
| 3.9.7 | Full progress tracker | Draft > Sent > In Progress > Shipped > Completed with dates | |
| 3.9.8 | Order detail shows all items and their fulfillment status | Per-item intake/shipment tracking | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 78 |
| **Passed** | -- |
| **Failed** | -- |
| **Warnings** | -- |
