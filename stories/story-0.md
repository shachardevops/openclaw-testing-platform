# QA Report — Story 0: Admin Foundation Setup

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

## Scope

Admin foundation modules: Dashboard, Products, Intake, Inventory overview, Supplier Orders overview, Stones, System page accessibility, Hebrew locale, Sidebar navigation.

---

## 1. Dashboard (`/en/admin`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.1.1 | Dashboard loads at `/en/admin` | Greeting, date, quick action buttons | |
| 0.1.2 | `/en/admin/dashboard` redirects to `/en/admin` | 302 redirect (fix #109) | Was 404 prior to fix |
| 0.1.3 | Stats cards render: Revenue, Orders, In Stock, Pending Shipments | Correct counts from DB | |
| 0.1.4 | Alert cards: Pending orders, Shipments to process, Low stock | Counts match DB | |
| 0.1.5 | Recent Threads section renders | Shows threads or "No threads yet" empty state | |
| 0.1.6 | Quick action buttons: Create Order, Create Intake Document, Create Shipment | All 3 present and clickable | |
| 0.1.7 | Create Order navigates to `/en/admin/orders/new` | Uses locale-prefixed URL | |
| 0.1.8 | Create Intake navigates to `/en/admin/intake/new` | Uses locale-prefixed URL | |
| 0.1.9 | Create Shipment navigates to `/en/admin/shipments/new` | Uses locale-prefixed URL | |

---

## 2. Sidebar Navigation

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.2.1 | All nav items visible | Dashboard, Orders, Shipments, Intake, Inbox, Products, Inventory, Stones, Metals, Customers, Locations, Supplier Orders, Users, Semi Mounts (Assembly, Rings, Crowns), Automations, Activity Log, Trash | |
| 0.2.2 | Sidebar scrollable when items exceed viewport | `overflow-y-auto` on nav (fix #119) | Was clipped before |
| 0.2.3 | Trash link visible without scrolling issue | Trash in regular nav array (fix #119) | Was pinned/hidden |
| 0.2.4 | Inventory sub-menu expands (Stock Count link) | Toggle works, aria-labels translated | |
| 0.2.5 | Semi Mounts sub-menu expands (Assembly, Rings, Crowns) | Toggle works, aria-labels translated | |
| 0.2.6 | All sidebar aria-labels use `t()` calls | No hardcoded English (fix #59) | |
| 0.2.7 | Customers link present in sidebar | Added in fix #30 | |
| 0.2.8 | Active nav item highlighted | Current page highlighted in sidebar | |

---

## 3. Products (`/en/admin/products`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.3.1 | Products list loads with search, filters, "Add Product" | All present | |
| 0.3.2 | Product table renders with pagination | 20 per page, page count correct | |
| 0.3.3 | Multiple categories visible | Rings, Earrings, Bangles, Bracelets, Pendants, Necklaces, Chains | |
| 0.3.4 | Product images render in table thumbnails | Placeholder for missing images | |
| 0.3.5 | Pagination controls work (Next/Prev/Page numbers) | Correct page navigation | |
| 0.3.6 | Search by product name (live search) | Instant filter, no Enter required | |
| 0.3.7 | Product detail page opens on row click | Full edit form with all sections | |
| 0.3.8 | Product detail: Basic Info section | Name, Product Code, Description (rich text) | |
| 0.3.9 | Product detail: Classification section | Type, Category | |
| 0.3.10 | Product detail: Stone Configuration | Center Stone checkbox, Side Stone Specs | |
| 0.3.11 | Product detail: Product Options | Ring Size options, Metal Type options | |
| 0.3.12 | Product detail: Media | Up to 10 images, upload/remove | |
| 0.3.13 | Product detail: Pricing | Cost Price, Catalog Price, Currency | |
| 0.3.14 | Product detail: CAD and Mould Files | Upload sections present | |
| 0.3.15 | Product detail: Variants section | Variant list with SKU, options, stock, price | |
| 0.3.16 | Product detail: Inventory section | DN-coded items with location, status | |
| 0.3.17 | Inventory items within product detail link to inventory detail pages | Clickable DN codes | |

---

## 4. Intake (`/en/admin/intake`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.4.1 | Intake list loads with summary cards | Total, Last 30 days, by type | |
| 0.4.2 | Intake documents listed with number, date, items, type | Correct data | |
| 0.4.3 | Intake detail page loads | Summary stats: items, products, center stones, side stones | |
| 0.4.4 | Items table: Product, Quantity, Cost Price, Total Cost, Notes, Status | All columns render | |
| 0.4.5 | Center Stones table (if any) | Stone type, shape, carat, quality, certificate | |
| 0.4.6 | Side Stones table (if any) | Spec codes, type, shape, dimensions, carats | |
| 0.4.7 | Total summary footer | Items count, Total Cost | |
| 0.4.8 | Intake detail breadcrumb shows intake number (not UUID) | e.g., INK-260309-0002 | Known issue: may still show UUID |

---

## 5. Inventory Overview (`/en/admin/inventory`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.5.1 | Inventory list loads with items | All columns: Item ID, Model, SKU, Product, Location, Status, Center Stone, Side Stones, Created At | |
| 0.5.2 | Each item has clickable DN code → detail page | Navigation works | |
| 0.5.3 | Context menu per row (right-click or "..." button) | Actions available | |
| 0.5.4 | Search and filter controls present | Search bar + Filters button | |
| 0.5.5 | Pagination shows correct page count | 20 per page, total items | |

---

## 6. Orders Overview (`/en/admin/orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.6.1 | Orders list loads with table/card view toggle | Both views render | |
| 0.6.2 | "Add Order" button present | Navigates to create order form | |
| 0.6.3 | Search by order number and customer name | Live search works | |
| 0.6.4 | Filters: Status, Payment Status, Customer, Start/End Date | All present (fix #67 for dates) | |
| 0.6.5 | Row selection checkboxes work | Can select rows | |

---

## 7. Stones (`/en/admin/stones`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.7.1 | Stones page loads with Center Stones / Side Stones tabs | Both tabs switch correctly | |
| 0.7.2 | Center Stones: Display Name, Stone Type, Shape, Carat, Quality, Stock, Lab | All columns render | |
| 0.7.3 | Center Stones: sortable/filterable columns | Column headers interactive | |
| 0.7.4 | Center Stones: "Create Stone" button | Present and navigable | |
| 0.7.5 | Side Stones: Spec codes, shape, dimensions, stock | All columns render | |
| 0.7.6 | Side Stones: "Create" button and Filters | Present and functional | |

---

## 8. System Pages Accessibility

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.8.1 | `/en/admin/customers` accessible | Page loads without error | |
| 0.8.2 | `/en/admin/locations` accessible | Page loads without error | |
| 0.8.3 | `/en/admin/metals` accessible | Page loads, gold/platinum summary | |
| 0.8.4 | `/en/admin/shipments` accessible | Page loads without error | |
| 0.8.5 | `/en/admin/trash` accessible | Page loads with search, sort, restore (fix #100, #103) | |
| 0.8.6 | `/en/admin/users` accessible | Page loads without error | |
| 0.8.7 | `/en/admin/automations` accessible | Page loads without error | |
| 0.8.8 | `/en/admin/activity-log` accessible | Page loads, empty state correct (fix #110) | |
| 0.8.9 | `/en/admin/semi-mounts/assembly-orders` accessible | Page loads without error | |
| 0.8.10 | `/en/admin/semi-mounts/rings` accessible | Page loads without error | |
| 0.8.11 | `/en/admin/semi-mounts/crowns` accessible | Page loads without error | |
| 0.8.12 | `/en/admin/settings` accessible | Page loads with all sections | |
| 0.8.13 | `/en/admin/settings/stone-pricing` accessible | Correct locale prefix (fix #97) | |
| 0.8.14 | `/en/admin/dashboard` → redirects to `/en/admin` | 302 redirect (fix #109) | |

---

## 9. Hebrew Locale (`/he/admin`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.9.1 | Hebrew locale loads with full RTL layout | Text right-to-left, sidebar on right | |
| 0.9.2 | All nav items translated | לוח בקרה, הזמנות, משלוחים, קליטה, תיבת דואר, מוצרים, מלאי, אבנים, מתכות, לקוחות, מיקומים, הזמנות לספקים, משתמשים, סמי מאונטים, הרכבה, טבעות, כתרים, אוטומציות, יומן פעילות, סל מחזור | |
| 0.9.3 | URLs use `/he/` prefix | Correct locale routing | |
| 0.9.4 | Dashboard action buttons translated | צור הזמנה, צור מסמך קליטה, צור משלוח | |
| 0.9.5 | Dashboard stats labels translated | הכנסות, הזמנות, משלוחים ממתינים | |
| 0.9.6 | Dashboard greeting translated | "ערב טוב" (not "Good Evening") | Known issue from r6 |
| 0.9.7 | "In Stock" stat label translated | Not "In Stock" in English | Known issue from r6 |
| 0.9.8 | Sidebar toggle labels translated | fix #58: sidebar.toggleInventory, sidebar.toggleSemiMounts | |
| 0.9.9 | RTL chevron rotation | ChevronRight has `rtl:rotate-180` on collapsibles | |
| 0.9.10 | Entity identifiers (DN codes, order numbers) are `dir="ltr"` | Numbers/codes read LTR in RTL context | |

---

## 10. Breadcrumbs

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 0.10.1 | Dashboard breadcrumb | "Dashboard" or "לוח בקרה" | |
| 0.10.2 | Products breadcrumb | "Dashboard > Products" | |
| 0.10.3 | Activity Log breadcrumb | Shows translated name, not "activity-log" (fix #69) | |
| 0.10.4 | Trash breadcrumb | Shows "Trash" capitalized (fix #98) | |
| 0.10.5 | Location detail breadcrumb | Shows location name, not UUID (fix #101) | |
| 0.10.6 | Intake detail breadcrumb | Shows intake number, not UUID | Known issue |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 67 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
