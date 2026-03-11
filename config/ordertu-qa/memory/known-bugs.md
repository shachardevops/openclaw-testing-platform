# Known Bugs — Cross-Run Tracker

## S0-B2 — Intake breadcrumb shows raw UUID
- **Status:** not verifiable (data cleaned)
- **Story:** story-0
- **Module:** Intake
- **First found:** r1 (2026-03-06)
- **Last seen:** r7 (2026-03-09)
- **Page:** `/en/admin/intake/[id]`
- **Description:** Breadcrumb shows raw UUID instead of intake number (INK-XXXXXX-XXXX)
- **Fix applied:** none yet
- **Note (r8):** No intake documents exist after data clean. Needs intake creation to retest.

## S0-B7 — Product detail page 500 when code is used as route param
- **Status:** FIXED ✅
- **Story:** story-0
- **Module:** Products
- **First found:** r7 (2026-03-09)
- **Last seen:** r7 (2026-03-09)
- **Fixed in:** r8 (2026-03-10)
- **Page:** `/en/admin/products/[id]`
- **Description:** Passing product code in route (e.g., `SM-RING-001`) now resolves correctly. No 500 error.

## S0-B8 — Locations search placeholder says "Placeholder"
- **Status:** new
- **Story:** story-0
- **Module:** Locations
- **First found:** r8 (2026-03-10)
- **Last seen:** r8 (2026-03-10)
- **Page:** `/en/admin/locations`
- **Description:** Search input placeholder text is literally "Placeholder" instead of "Search locations..."
- **Fix applied:** none yet

## S0-B9 — Dashboard greeting not translated in Hebrew locale
- **Status:** new
- **Story:** story-0
- **Module:** Dashboard (i18n)
- **First found:** r8 (2026-03-10)
- **Last seen:** r8 (2026-03-10)
- **Page:** `/he/admin`
- **Description:** "Good Evening" greeting shows in English while rest of page is in Hebrew
- **Fix applied:** none yet

## S0-B10 — Dashboard "In Stock" label not translated in Hebrew locale
- **Status:** new
- **Story:** story-0
- **Module:** Dashboard (i18n)
- **First found:** r8 (2026-03-10)
- **Last seen:** r8 (2026-03-10)
- **Page:** `/he/admin`
- **Description:** "In Stock" stat card label remains in English in Hebrew locale
- **Fix applied:** none yet

## S0-W1 — Duplicate supplier names in chips
- **Status:** not verifiable (data cleaned)
- **Story:** story-0
- **Module:** Supplier Orders
- **First found:** r4 (2026-03-08)
- **Last seen:** r6 (2026-03-09)
- **Page:** `/en/admin/supplier-orders`
- **Description:** All 3 "Recent" supplier chips display the same supplier name
- **Fix applied:** none yet
- **Note (r8):** No supplier orders exist after data clean. Needs orders to retest.

## S1-B1 — Buyer PDP returns 404 for existing product
- **Status:** open
- **Story:** story-1
- **Module:** Buyer Catalog / PDP
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Page:** `/en/buyer/catalog/f69e6b76-3fe9-4862-a502-2e3cfad676b8`
- **Description:** Product "Semi Mount Demo Ring" is visible in catalog listing but its detail page returns 404. Server responds with 404 status. Blocks all PDP, cart, checkout, and order flows.
- **Fix applied:** none yet

## S1-B2 — "Open Cart" button not translated in Hebrew
- **Status:** open
- **Story:** story-1
- **Module:** Buyer i18n
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Page:** `/he/buyer/catalog` (and all buyer pages)
- **Description:** Cart button label "Open Cart" remains in English in Hebrew locale
- **Fix applied:** none yet

## S1-B3 — Stock "Out" badge not translated in Hebrew
- **Status:** open
- **Story:** story-1
- **Module:** Buyer i18n
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Page:** `/he/buyer/catalog`
- **Description:** Stock status "Out" badge shown in English in Hebrew locale
- **Fix applied:** none yet

## S1-B4 — Catalog action buttons not translated in Hebrew
- **Status:** open
- **Story:** story-1
- **Module:** Buyer i18n
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Page:** `/he/buyer/catalog`
- **Description:** "View details", "Grid view", "Table view" buttons remain in English in Hebrew locale
- **Fix applied:** none yet

## S4-B1 — Distributor catalog product detail pages return 404
- **Status:** open
- **Story:** story-4
- **Module:** Distributor Catalog / PDP
- **First found:** r10 (2026-03-11)
- **Last seen:** r10 (2026-03-11)
- **Page:** `/en/distributor/catalog/{product-uuid}`
- **Description:** All product detail pages in the distributor catalog return 404 "Page Not Found". Both the "Recently Viewed" card links and direct URL navigation to a valid product UUID show 404. The catalog list view works but detail view is broken.
- **Affects:** Semi Mount Demo Ring (f69e6b76), BANGLE EK0456L03 (1cc470ac) — all products tested return 404
- **Fix applied:** none yet
- **Related:** S1-B1 (same 404 bug exists in buyer catalog PDP)

## S5-W2 — Buyer has Resolve button on thread detail
- **Status:** open (PERSISTS from r3)
- **Story:** story-5
- **Module:** Buyer / Threads
- **First found:** r3 (2026-03-08)
- **Last seen:** r11 (2026-03-11)
- **Page:** `/en/buyer/inbox/{thread-id}`
- **Description:** Buyer-role users can see and use the "Resolve" button on their own threads. No "Pin" button present, so partial moderation restriction is in place, but Resolve should potentially be restricted to admin/owner roles only.
- **Fix applied:** none yet

## S5-W3 — Distributor role filter tab missing in Users page
- **Status:** FIXED ✅
- **Story:** story-5
- **Module:** Admin / Users
- **First found:** r3 (2026-03-08)
- **Fixed in:** r11 (2026-03-11)
- **Page:** `/en/admin/users`
- **Description:** "Distributor" role filter tab was missing. Now shows "Distributor 1" filter button correctly.

## S5-W4 — Admin thread not visible to supplier (participant-scoped)
- **Status:** open (design question)
- **Story:** story-5
- **Module:** Inbox / Threads
- **First found:** r11 (2026-03-11)
- **Last seen:** r11 (2026-03-11)
- **Page:** `/en/supplier/inbox`
- **Description:** Threads created by admin are only visible to admin-role users because auto-assigned participants are limited to admin role. No UI to add cross-portal participants during thread creation. Supplier/buyer/distributor threads ARE visible to admin (one-way cross-portal).
- **Fix applied:** none yet — may be by design

## S4-B2 — /en/distributor/create-order redirects to admin dashboard
- **Status:** open
- **Story:** story-4
- **Module:** Distributor Order Creation
- **First found:** r10 (2026-03-11)
- **Last seen:** r10 (2026-03-11)
- **Page:** `/en/distributor/create-order`
- **Description:** Navigating to /en/distributor/create-order (linked from the dashboard "Create Order" CTA) redirects to the admin dashboard. The route likely does not exist in the distributor portal middleware, causing a fallback to admin. This completely blocks the distributor order creation flow.
- **Fix applied:** none yet

## S6-W1 — Card view empty state showed "No Orders Description"
- **Status:** FIXED ✅
- **Story:** story-6
- **Module:** Admin / Orders List
- **First found:** r4 (2026-03-11)
- **Fixed in:** r5 (2026-03-11)
- **Page:** `/en/admin/orders`
- **Description:** Empty state in card view now correctly shows "No Orders Found". Previously showed raw "No Orders Description" placeholder.

## S6-W2 — Broken product images in selection dialog
- **Status:** open (PERSISTS)
- **Story:** story-6
- **Module:** Admin / Create Order
- **First found:** r4 (2026-03-11)
- **Last seen:** r5 (2026-03-11)
- **Page:** `/en/admin/orders/new`
- **Description:** Product images in the product selection combobox/dialog fail to load. Images reference valigara.com CDN URLs (e.g., `https://media.valigara.com/cl/512/...`) which return broken image errors. Products display with broken image placeholders.
- **Fix applied:** none yet

## S6-W3 — Stale data flash after edit save redirect
- **Status:** FIXED ✅
- **Story:** story-6
- **Module:** Admin / Edit Order
- **First found:** r4 (2026-03-11)
- **Fixed in:** r5 (2026-03-11)
- **Page:** `/en/admin/orders/[id]`
- **Description:** After saving an edited order, the detail page now immediately shows the updated data with no flash of old values.

## S6-W4 — Activity log doesn't auto-refresh after inline mutations
- **Status:** open (new in r5)
- **Story:** story-6
- **Module:** Admin / Order Detail
- **First found:** r5 (2026-03-11)
- **Last seen:** r5 (2026-03-11)
- **Page:** `/en/admin/orders/[id]`
- **Description:** The activity log section does not update in real-time after inline mutations (status badge change, Record Payment dialog close). Activity entries only appear after a full page reload (e.g., after Edit save redirect). Root cause: query invalidation for activity-log is not triggered on status-change or payment mutations.
- **Fix applied:** none yet

## S6-W5 — Tablet: payment amount text overlaps Order Date column
- **Status:** open (new in r5)
- **Story:** story-6
- **Module:** Admin / Order Detail
- **First found:** r5 (2026-03-11)
- **Last seen:** r5 (2026-03-11)
- **Page:** `/en/admin/orders/[id]`
- **Viewport:** 768x1024 (iPad)
- **Description:** In the Order Progress status row, the "($amount / $total)" payment detail text overflows its column and overlaps with the adjacent Order Date column at tablet width (768px with sidebar). No body-level horizontal overflow; issue is internal column layout.
- **Fix applied:** none yet

## S7-B1 — Inventory filters dialog shows placeholder "Title" / "Description"
- **Status:** open
- **Story:** story-7
- **Module:** Admin / Inventory
- **First found:** r3 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Page:** `/en/admin/inventory`
- **Description:** The inventory filters dialog heading shows "Title" and the description paragraph shows "Description" — both are placeholder/template text that were never replaced with proper labels like "Filter Inventory" / "Narrow down inventory items by location, status, category, or supplier."
- **Fix applied:** none yet

## S7-B2 — Center stones empty state shows placeholder text
- **Status:** open
- **Story:** story-7
- **Module:** Admin / Inventory Detail
- **First found:** r3 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Page:** `/en/admin/inventory/[id]`
- **Description:** When an inventory item has no center stones, the empty state shows heading "Empty" and paragraph "Empty Description" — placeholder text instead of something like "No center stones" / "This item has no center stones assigned."
- **Fix applied:** none yet
