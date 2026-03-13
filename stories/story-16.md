# QA Report — Responsive UI & Mobile/Tablet Compliance

**Run:** r1
**Date:** 2026-03-11
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile)
**Login:** test@example.com / 121212

## Scope

Verify that all pages and components render correctly across three breakpoints:
- **Mobile** (375px width — iPhone SE / small phone)
- **Tablet** (768px width — iPad portrait)
- **Desktop** (1280px+ width — standard laptop)

For each test: resize the browser to the specified width (or use DevTools device toolbar), navigate to the page, and verify the layout behaves as described.

**Key patterns to validate:**
- Two-column layouts collapse to single column on mobile/tablet
- Data tables get horizontal scroll (`overflow-x-auto`) on small screens
- Forms stack vertically on mobile, use multi-column grids on tablet/desktop
- No content overflow, no horizontal page scroll, no truncated buttons
- Touch targets are at least 44x44px on mobile
- Text remains readable (no overlapping, no clipping)

---

## 1. Global Shell & Navigation

### 1.1 Header (`/en/admin`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 1.1.1 | Header renders without overflow | Mobile | No horizontal scroll on page | | |
| 1.1.2 | Search bar hidden on mobile | Mobile | Only search icon button visible, not the full search input | | |
| 1.1.3 | Search bar visible from lg (1024px) | Tablet | Search bar appears as `w-48` input starting at lg breakpoint | | |
| 1.1.4 | Search bar expands on desktop | Desktop | Search input `w-48 xl:w-80` — wider at xl breakpoint | | |
| 1.1.5 | Header padding responsive | Mobile | `px-4` on mobile, `px-6` on md+ | | |
| 1.1.6 | All header actions accessible | Mobile | Language toggle, notifications, user menu all tappable | | |

### 1.2 Sidebar

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 1.2.1 | Sidebar hidden on mobile | Mobile | Sheet/drawer overlay instead of fixed sidebar | | |
| 1.2.2 | Sidebar toggle button visible | Mobile | Hamburger menu button in header | | |
| 1.2.3 | Sidebar scrollable when content overflows | Tablet | `overflow-y-auto` allows scrolling through all nav items | | |
| 1.2.4 | Sidebar + content don't overlap | Tablet | Content area doesn't get pushed off-screen | | |

### 1.3 Page Shell

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 1.3.1 | Page padding responsive | Mobile | `px-4 py-4` on mobile | | |
| 1.3.2 | Page padding desktop | Desktop | `px-6 py-6` on md+ | | |
| 1.3.3 | No horizontal page scroll | Mobile | Content stays within viewport bounds | | |

---

## 2. Order Detail Page (`/en/admin/orders/{id}`)

### 2.1 Two-Column Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 2.1.1 | Single column layout | Mobile | Main content full-width, sidebar cards stack below | | |
| 2.1.2 | Two-column layout at md | Tablet | `grid-cols-[1fr_320px]` — sidebar 320px, content fills rest | | |
| 2.1.3 | Two-column layout at lg | Desktop | `grid-cols-[1fr_380px]` — sidebar widens to 380px | | |
| 2.1.4 | Gap between columns | All | `gap-4` consistent across breakpoints | | |

### 2.2 Status Bar

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 2.2.1 | Vertical timeline on mobile | Mobile | `sm:hidden` shows vertical step layout | | |
| 2.2.2 | Horizontal timeline on sm+ | Tablet | `hidden sm:block` shows horizontal status timeline | | |
| 2.2.3 | Status info grid: 2 cols on mobile | Mobile | `grid-cols-2` with `gap-3` | | |
| 2.2.4 | Status info grid: 3 cols on sm+ | Tablet | `grid-cols-3` with `gap-4` | | |
| 2.2.5 | Payment text doesn't overlap status | Tablet | Payment display truncates with `truncate max-w-full` | | |
| 2.2.6 | Payment text wraps in flex container | Mobile | `flex-wrap` prevents overflow on narrow screens | | |

### 2.3 Timeline Labels

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 2.3.1 | Timeline labels don't overflow | Mobile | Labels use `truncate max-w-full` instead of `whitespace-nowrap` | | |
| 2.3.2 | Timeline label containers have `min-w-0` | Mobile | Allows flex children to shrink below content size | | |

---

## 3. Inventory Detail Page (`/en/admin/inventory/{id}`)

### 3.1 Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 3.1.1 | Single column on mobile | Mobile | All cards stack vertically | | |
| 3.1.2 | Two-column at md (320px sidebar) | Tablet | Barcode + stones on left, info cards on right | | |
| 3.1.3 | Two-column at lg (380px sidebar) | Desktop | Wider sidebar | | |

### 3.2 Movement History Table

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 3.2.1 | Table scrolls horizontally | Mobile | `overflow-x-auto` wrapper allows swiping | | |
| 3.2.2 | All columns visible via scroll | Mobile | Date, Type, From, To, Status, Reference, Notes, By — all accessible | | |
| 3.2.3 | Reference column shows data | All | Order/shipment numbers shown (e.g., #ORD-001) or reference type fallback | | |
| 3.2.4 | Table renders without overflow | Desktop | All columns fit without scrollbar | | |

### 3.3 Center Stones Section

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 3.3.1 | Empty state renders properly | Mobile | "No center stones" with icon, centered | | |
| 3.3.2 | Stone cards don't overflow | Mobile | Cards stack or wrap properly | | |

### 3.4 Side Stones Section

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 3.4.1 | Side stones table scrollable | Mobile | Horizontal scroll if table too wide | | |
| 3.4.2 | Empty state renders properly | Mobile | "No side stones" with sparkle icon | | |
| 3.4.3 | Add/Edit buttons accessible | Mobile | Touch targets adequate (min 44px) | | |

---

## 4. Product Detail Page (`/en/admin/products/{id}`)

### 4.1 Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 4.1.1 | Single column on mobile | Mobile | All sections stack | | |
| 4.1.2 | Responsive spacing | Mobile | `space-y-4` reduced from 6 | | |

### 4.2 Inventory Section on Product Detail

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 4.2.1 | Header stacks on mobile | Mobile | `flex-col` — title above search/actions | | |
| 4.2.2 | Header inline on sm+ | Tablet | `flex-row` — title and actions side by side | | |
| 4.2.3 | Search input responsive width | All | `w-full sm:w-48 md:w-64` | | |
| 4.2.4 | Table scrollable on mobile | Mobile | `overflow-x-auto` + `min-w-[900px]` table | | |
| 4.2.5 | Print button short label on mobile | Mobile | Shows "Print" on mobile, full text on sm+ (`hidden sm:inline`) | | |

---

## 5. Shipment Detail Page (`/en/admin/shipments/{id}`)

### 5.1 Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 5.1.1 | Single column on mobile | Mobile | Full-width cards stacked | | |
| 5.1.2 | Two-column at md | Tablet | `grid-cols-[1fr_320px]` | | |
| 5.1.3 | Two-column at lg | Desktop | `grid-cols-[1fr_380px]` | | |
| 5.1.4 | Material tracking section readable | Mobile | Cards/tables don't overflow | | |

---

## 6. Supplier Order Detail (`/en/admin/supplier-orders/{id}`)

### 6.1 Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 6.1.1 | Single column on mobile | Mobile | Items list + sidebar stack vertically | | |
| 6.1.2 | Two-column at md | Tablet | `grid-cols-[1fr_320px]` | | |
| 6.1.3 | Two-column at lg | Desktop | `grid-cols-[1fr_380px]` | | |
| 6.1.4 | Responsive gap and spacing | All | `gap-4`, `space-y-4` | | |

---

## 7. Location Detail Page (`/en/admin/locations/{id}`)

### 7.1 Layout

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 7.1.1 | Single column on mobile | Mobile | Cards stack | | |
| 7.1.2 | Two-column at md | Tablet | `grid-cols-[1fr_320px]` | | |
| 7.1.3 | Two-column at lg | Desktop | `grid-cols-[1fr_380px]` | | |

---

## 8. Create Order / Create Shipment / Supplier Order Form

### 8.1 Create Order (`/en/admin/orders/create`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 8.1.1 | Single column on mobile | Mobile | Form fills full width | | |
| 8.1.2 | Side panel at md | Tablet | `grid-cols-[1fr_280px]` — order summary sidebar | | |
| 8.1.3 | Form fields don't overflow | Mobile | All inputs reachable and tappable | | |

### 8.2 Create Shipment (`/en/admin/shipments/create`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 8.2.1 | Single column on mobile | Mobile | Wizard steps stack | | |
| 8.2.2 | Side panel at md | Tablet | `grid-cols-[1fr_280px]` | | |

### 8.3 Supplier Order Form (`/en/admin/supplier-orders/create`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 8.3.1 | Single column on mobile | Mobile | Form fills full width | | |
| 8.3.2 | Side panel at md | Tablet | `grid-cols-[1fr_280px]` | | |

---

## 9. Supplier Intake Form (`/en/admin/intake/create`)

### 9.1 Main Field Row

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 9.1.1 | 6-column grid on mobile | Mobile | `grid-cols-6 gap-3` — fields wrap to multiple rows | | |
| 9.1.2 | 12-column grid on sm+ | Tablet | `grid-cols-12 gap-4` — fields in single row | | |
| 9.1.3 | Purity/Loss row responsive | Mobile | `grid-cols-2 gap-3` on mobile, `grid-cols-12 gap-4` on sm+ | | |
| 9.1.4 | Gold Value/Labor Cost row responsive | Mobile | Same pattern as purity/loss | | |

### 9.2 Intake Items Table

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 9.2.1 | Table has horizontal scroll | Mobile | `overflow-x-auto` + `min-w-[500px]` | | |
| 9.2.2 | Responsive header padding | Mobile | Reduced padding on mobile | | |
| 9.2.3 | All columns accessible via scroll | Mobile | Can swipe to see all item columns | | |

---

## 10. Intake Metal Entry Form

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 10.1 | Single column on mobile | Mobile | `grid-cols-1` — fields stack vertically | | |
| 10.2 | Two columns on sm | Tablet (sm) | `grid-cols-2` — fields in pairs | | |
| 10.3 | Three columns on md+ | Tablet (md) | `grid-cols-3` — all fields visible | | |
| 10.4 | Responsive gap | All | `gap-3` on mobile, `gap-4` on sm+ | | |

---

## 11. Payment Dialog

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 11.1 | Dialog max-width responsive | Mobile | `sm:max-w-[500px]` — full width on mobile, capped on sm+ | | |
| 11.2 | Payment overview grid readable | Mobile | 3-column grid — amounts don't overlap | | |
| 11.3 | RTL layout correct | Mobile (he) | Text alignment flips, flex-row-reverse on footer | | |
| 11.4 | Payment amount input usable | Mobile | Touch-friendly, adequate size | | |
| 11.5 | Record button text doesn't overflow | Mobile | Dollar icon + text fit within button bounds | | |

---

## 12. Stock Count Page (`/en/admin/inventory/stock-count`)

### 12.1 Expected Items List

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 12.1.1 | Card height responsive | Mobile | `h-[400px]` on mobile, `h-[500px]` on sm+ | | |
| 12.1.2 | Header padding responsive | Mobile | `px-4` on mobile, `px-5` on sm+ | | |
| 12.1.3 | Status filter tabs accessible | Mobile | Filter buttons don't overflow, wrap if needed | | |
| 12.1.4 | Sold/Reserved filter works | Mobile | Changing filter refetches server-side (not client-side) — items actually appear | | |
| 12.1.5 | Item cards readable | Mobile | Item name, DN code, status badge all visible | | |
| 12.1.6 | Infinite scroll works | Mobile | Loading more items on scroll-to-bottom | | |

---

## 13. Dashboard (`/en/admin`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 13.1 | Metric cards: 2 cols on mobile | Mobile | `grid-cols-2` | | |
| 13.2 | Metric cards: 4 cols on lg | Desktop | `grid-cols-4` | | |
| 13.3 | Metric values readable | Mobile | Numbers don't overflow card bounds | | |
| 13.4 | Section spacing compact | Mobile | `space-y-4` throughout | | |

---

## 14. Data Tables (All List Pages)

Test on: Inventory list, Orders list, Shipments list, Supplier Orders list, Products list, Intake list

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 14.1 | Tables have horizontal scroll | Mobile | Can swipe left/right to see all columns | | |
| 14.2 | Table headers readable | Mobile | Column headers don't overlap | | |
| 14.3 | Row actions accessible | Mobile | Action buttons/menus tappable | | |
| 14.4 | Pagination controls usable | Mobile | Page buttons don't overflow, touch-friendly | | |
| 14.5 | Search/filter bar responsive | Mobile | Filters collapse or stack, search input full-width | | |
| 14.6 | Filter dialog opens properly | Mobile | Filter modal/sheet usable on small screens | | |

---

## 15. Loading States

Test on: Order detail, Inventory detail, Product form loading states

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 15.1 | Order detail skeleton responsive | Mobile | `grid-cols-1` — single column skeleton | | |
| 15.2 | Order detail skeleton two-column | Tablet | `grid-cols-[1fr_320px]` skeleton layout matches actual layout | | |
| 15.3 | Inventory detail skeleton responsive | Mobile | Single column skeleton | | |
| 15.4 | Product form skeleton responsive | Tablet | Two-column skeleton matches form layout | | |

---

## 16. Buyer Portal (`/en/buyer`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 16.1 | Catalog grid responsive | Mobile | Single column or 2-column product cards | | |
| 16.2 | Catalog grid tablet | Tablet | 2-3 column grid | | |
| 16.3 | Product detail page responsive | Mobile | Image + details stack vertically | | |
| 16.4 | Cart page responsive | Mobile | Cart items stack, totals visible | | |
| 16.5 | Orders list responsive | Mobile | Table scrollable or cards layout | | |

---

## 17. Supplier Portal (`/en/supplier`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 17.1 | Dashboard stats responsive | Mobile | `grid-cols-2` metric cards | | |
| 17.2 | Orders list responsive | Mobile | Table scrollable | | |
| 17.3 | Intake form responsive | Mobile | Fields stack vertically | | |

---

## 18. Distributor Portal (`/en/distributor`)

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 18.1 | Dashboard stats responsive | Mobile | Metric cards wrap | | |
| 18.2 | Inventory list responsive | Mobile | Table scrollable | | |
| 18.3 | Report sale form responsive | Mobile | Fields stack | | |

---

## 19. Hebrew RTL + Responsive Combined

| # | Test | Breakpoint | Expected | Result | Notes |
|---|------|-----------|----------|--------|-------|
| 19.1 | Order detail RTL + mobile | Mobile (he) | Single column, RTL text alignment | | |
| 19.2 | Order status bar RTL + mobile | Mobile (he) | Vertical timeline, RTL labels | | |
| 19.3 | Payment dialog RTL + mobile | Mobile (he) | Full-width dialog, Hebrew text, `flex-row-reverse` footer | | |
| 19.4 | Inventory detail RTL + tablet | Tablet (he) | Two-column with sidebar on left (RTL) | | |
| 19.5 | Data table RTL + mobile | Mobile (he) | Horizontal scroll starts from right side | | |
| 19.6 | Dashboard RTL + mobile | Mobile (he) | Metric cards grid RTL, Hebrew labels readable | | |

---

## Defects & Observations

| # | Severity | Page | Breakpoint | Description | Notes |
|---|----------|------|-----------|-------------|-------|
| | | | | | |

**Severity key:** BUG = broken functionality, WARN = visual issue, INFO = minor cosmetic

---

## Test Coverage Summary

| Section | Tests | Pass | Fail | Warn |
|---------|-------|------|------|------|
| Global Shell & Navigation | 13 | — | — | — |
| Order Detail | 10 | — | — | — |
| Inventory Detail | 10 | — | — | — |
| Product Detail | 7 | — | — | — |
| Shipment Detail | 4 | — | — | — |
| Supplier Order Detail | 4 | — | — | — |
| Location Detail | 3 | — | — | — |
| Create Order/Shipment/SO | 6 | — | — | — |
| Supplier Intake Form | 7 | — | — | — |
| Intake Metal Entry | 4 | — | — | — |
| Payment Dialog | 5 | — | — | — |
| Stock Count | 6 | — | — | — |
| Dashboard | 4 | — | — | — |
| Data Tables (all lists) | 6 | — | — | — |
| Loading States | 4 | — | — | — |
| Buyer Portal | 5 | — | — | — |
| Supplier Portal | 3 | — | — | — |
| Distributor Portal | 3 | — | — | — |
| Hebrew RTL + Responsive | 6 | — | — | — |
| **TOTAL** | **110** | — | — | — |

---

SUMMARY: Passed: — | Failed: — | Warnings: —
