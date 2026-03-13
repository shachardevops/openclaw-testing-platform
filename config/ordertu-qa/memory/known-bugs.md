# Known Bugs — Cross-Run Tracker

## S3-B1 — Supplier transactions blocked when supplier location is not configured
- **Status:** open
- **Story:** story-3
- **Module:** Supplier / Transactions
- **First found:** r8 (2026-03-12)
- **Last seen:** r9 (2026-03-12)
- **Page:** `/en/supplier/transactions`
- **Description:** Transactions page renders blocking state: "Transactions not available. Your supplier profile has not been configured with a location yet. Please contact your administrator." This blocks purchase/material-usage/labor/manual-adjustment flows in supplier manufacturing story.
- **Fix applied:** none yet

## S3-B2 — Supplier portal allows admin identity context (RBAC leakage)
- **Status:** open
- **Story:** story-3
- **Module:** Supplier / Auth Context
- **First found:** r9 (2026-03-12)
- **Last seen:** r9 (2026-03-12)
- **Page:** `/en/supplier/profile`
- **Description:** Navigating to supplier routes while authenticated as admin (`test@example.com`) renders Supplier portal UI but account card still shows role `Admin`. Indicates supplier route/context is not enforcing supplier-only identity.
- **Fix applied:** none yet

## S0-B2 — Intake breadcrumb shows raw UUID
- **Status:** not verifiable (no breadcrumb component)
- **Story:** story-0
- **Module:** Intake
- **First found:** r1 (2026-03-06)
- **Last seen:** r7 (2026-03-09)
- **Page:** `/en/admin/intake/[id]`
- **Description:** Breadcrumb shows raw UUID instead of intake number (INK-XXXXXX-XXXX)
- **Fix applied:** none yet
- **Note (r9):** Intake detail page has no breadcrumb navigation component visible in r9. Cannot verify UUID issue.

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
- **Status:** FIXED ✅
- **Story:** story-0
- **Module:** Locations
- **First found:** r8 (2026-03-10)
- **Last seen:** r1 / story-16 (2026-03-11)
- **Fixed in:** story-11 r1 (2026-03-11)
- **Page:** `/en/admin/locations`
- **Description:** Search input now correctly shows "Search locations..." placeholder.
- **Fix applied:** Yes

## S0-B9 — Dashboard greeting not translated in Hebrew locale
- **Status:** FIXED ✅
- **Story:** story-0
- **Module:** Dashboard (i18n)
- **First found:** r8 (2026-03-10)
- **Last seen:** r8 (2026-03-10)
- **Fixed in:** story-16 r1 (2026-03-11)
- **Page:** `/he/admin`
- **Description:** "Good Evening" greeting now shows "ערב טוב" in Hebrew
- **Fix applied:** Yes

## S0-B10 — Dashboard "In Stock" label not translated in Hebrew locale
- **Status:** FIXED ✅
- **Story:** story-0
- **Module:** Dashboard (i18n)
- **First found:** r8 (2026-03-10)
- **Last seen:** r8 (2026-03-10)
- **Fixed in:** story-16 r1 (2026-03-11)
- **Page:** `/he/admin`
- **Description:** "In Stock" stat card label now shows "במלאי" in Hebrew locale
- **Fix applied:** Yes

## S0-W1 — Duplicate supplier names in chips
- **Status:** not verifiable (insufficient data)
- **Story:** story-0
- **Module:** Supplier Orders
- **First found:** r4 (2026-03-08)
- **Last seen:** r6 (2026-03-09)
- **Page:** `/en/admin/supplier-orders`
- **Description:** All 3 "Recent" supplier chips display the same supplier name
- **Fix applied:** none yet
- **Note (r9):** Only 1 supplier order exists. Cannot reproduce duplicate chip issue — needs 3+ orders from different suppliers.

## S1-B1 — Buyer PDP returns 404 for existing product
- **Status:** FIXED ✅
- **Story:** story-1
- **Module:** Buyer Catalog / PDP
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Fixed in:** story-11 r1 (2026-03-11)
- **Page:** `/en/buyer/catalog/{product-uuid}`
- **Description:** PDP now loads correctly with product details, metal type selection, pricing, and add-to-cart. Tested with BANGLE AD001B (bc06c8e5).
- **Fix applied:** Yes

## S1-B2 — "Open Cart" button not translated in Hebrew
- **Status:** FIXED ✅
- **Story:** story-1
- **Module:** Buyer i18n
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Fixed in:** r10 (2026-03-12)
- **Page:** `/he/buyer/catalog` (and all buyer pages)
- **Description:** Cart button now shows "פתח עגלה" in Hebrew locale.
- **Fix applied:** Yes

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
- **Status:** FIXED ✅
- **Story:** story-1
- **Module:** Buyer i18n
- **First found:** r9 (2026-03-10)
- **Last seen:** r9 (2026-03-10)
- **Fixed in:** r10 (2026-03-12)
- **Page:** `/he/buyer/catalog`
- **Description:** "View details" → "צפייה", "Grid view" → "תצוגת רשת", "Table view" → "תצוגת טבלה" — all now translated.
- **Fix applied:** Yes

## S1-B5 — inStock=true URL filter returns HTTP 500
- **Status:** open
- **Story:** story-1
- **Module:** Buyer Catalog Filters
- **First found:** r10 (2026-03-12)
- **Last seen:** r10 (2026-03-12)
- **Page:** `/en/buyer/catalog?inStock=true`
- **Description:** Navigating to catalog with `?inStock=true` returns HTTP 500 server error and shows 0 products. Console confirms 500 status. Products clearly have stock (badges show 6, 2, 1, etc.) but the filter query fails server-side.
- **Fix applied:** none yet

## S4-B1 — Distributor catalog product detail pages return 404
- **Status:** FIXED ✅
- **Story:** story-4
- **Module:** Distributor Catalog / PDP
- **First found:** r10 (2026-03-11)
- **Last seen:** r10 (2026-03-11)
- **Fixed in:** story-11 r1 (2026-03-11)
- **Page:** `/en/distributor/catalog/{product-uuid}`
- **Description:** Distributor catalog PDP now loads correctly with full product details, metal type selection, pricing, and add-to-cart. Tested with BANGLE AD001B (bc06c8e5).
- **Fix applied:** Yes
- **Related:** S1-B1 (both buyer and distributor PDP fixed together)

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
- **Status:** FIXED ✅
- **Story:** story-7
- **Module:** Admin / Inventory
- **First found:** r3 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Fixed in:** story-16 r1 (2026-03-11)
- **Page:** `/en/admin/inventory`
- **Description:** Dialog now correctly shows "Inventory Filters" and "Filter inventory by location, status, category, or supplier."
- **Fix applied:** Yes

## S7-B2 — Center stones empty state shows placeholder text
- **Status:** open
- **Story:** story-7
- **Module:** Admin / Inventory Detail
- **First found:** r3 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Page:** `/en/admin/inventory/[id]`
- **Description:** When an inventory item has no center stones, the empty state shows heading "Empty" and paragraph "Empty Description" — placeholder text instead of something like "No center stones" / "This item has no center stones assigned."
- **Fix applied:** none yet

## S16-W1 — Mobile: Admin Dashboard 'Low stock items' truncated to 'Low stock i'
- **Status:** open
- **Story:** story-16
- **Module:** Admin Dashboard
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/admin`
- **Viewport:** 375x812 mobile
- **Description:** Stat card label "Low stock items" clips to "Low stock i" at 375px width.
- **Fix applied:** none yet

## S16-W3 — Supplier Transactions page shows raw technical error message
- **Status:** FIXED ✅
- **Story:** story-16
- **Module:** Supplier Transactions
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Fixed in:** story-11 r1 (2026-03-11)
- **Page:** `/en/supplier/transactions`
- **Viewport:** desktop
- **Description:** Page now shows proper transaction UI with balance cards (Funds, Pure Gold, Pure Platinum), "Add Transaction" button, and empty "No results" state.
- **Fix applied:** Yes

## S16-W4 — Mobile: Admin Orders table columns severely cut off
- **Status:** open
- **Story:** story-16
- **Module:** Admin Orders
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/admin/orders`
- **Viewport:** 375x812 mobile
- **Description:** Only Order #, Date, partial Customer columns visible. Status, Payment, Notes columns hidden.
- **Fix applied:** none yet

## S16-W5 — Mobile: Admin Inventory table shows only 3 columns
- **Status:** open
- **Story:** story-16
- **Module:** Admin Inventory
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/admin/inventory`
- **Viewport:** 375x812 mobile
- **Description:** Only Item ID, Model, partial SKU columns visible. Product, Location, Status, and all other columns hidden.
- **Fix applied:** none yet

## S16-W9 — Mobile: Semi-Mount Rings table columns cut off
- **Status:** open
- **Story:** story-16
- **Module:** Semi-Mounts Rings
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/admin/semi-mounts/rings`
- **Viewport:** 375x812 mobile
- **Description:** Column header "Size Segment" truncated to "Size Segme". Metal, CAD, availability columns hidden.
- **Fix applied:** none yet

## S11-B1 — Dashboard "Processing" count shows 2 but no orders have processing status
- **Status:** open
- **Story:** story-11
- **Module:** Admin Dashboard
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/admin` → links to `/en/admin/orders?status=processing`
- **Description:** Needs Attention card shows "2 Processing" but all 2 orders (ORD-202603-00001, ORD-202603-00002) have status "Confirmed". Clicking the card navigates to filtered view showing "No Orders Yet". Dashboard stat query likely counts orders incorrectly (possibly all non-delivered or non-completed orders).
- **Fix applied:** none yet

## S8-F8 — ReferenceError: t is not defined in UnifiedItemSelector
- **Status:** FIXED ✅
- **Story:** story-8
- **Module:** Admin / Shipments
- **First found:** r3 (2026-03-08)
- **Last seen:** r3 (2026-03-08)
- **Fixed in:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments/new`
- **Description:** UnifiedItemSelector crashed with ReferenceError when selecting From Location. `const { t } = useLocale()` was missing from component scope.
- **Fix applied:** Yes — useLocale hook restored to UnifiedItemSelector function body

## S8-W1 — Confirm Ship/Deliver dialog subtitle shows raw i18n key
- **Status:** open (PERSISTS from r3)
- **Story:** story-8
- **Module:** Admin / Shipments
- **First found:** r3 (2026-03-08)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments`
- **Description:** List-level Ship and Mark as Delivered confirmation dialogs show "Confirm Ship Description" and "Confirm Deliver Description" as subtitle text — raw i18n keys.
- **Fix applied:** none yet

## S8-W2 — Breadcrumb shows "More" instead of "Shipments"
- **Status:** open (new in r4)
- **Story:** story-8
- **Module:** Admin / Shipments
- **First found:** r4 (2026-03-11)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments/[id]`
- **Description:** Detail and edit page breadcrumbs show "Dashboard > More > SHP-..." instead of "Dashboard > Shipments > SHP-..."
- **Fix applied:** none yet

## S8-W3 — Button label inconsistency: Add vs Create Shipment
- **Status:** open (PERSISTS from r3)
- **Story:** story-8
- **Module:** Admin / Shipments
- **First found:** r3 (2026-03-08)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments`
- **Description:** Table view CTA says "Add", card view says "Create Shipment". Same action, different labels.
- **Fix applied:** none yet

## S8-W4 — Hebrew i18n: "Table view", "Card view", "Tracking" untranslated
- **Status:** open (new in r4)
- **Story:** story-8
- **Module:** Admin / Shipments (i18n)
- **First found:** r4 (2026-03-11)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/he/admin/shipments`
- **Description:** In Hebrew locale, "Table view", "Card view", and "Tracking" column header remain in English.
- **Fix applied:** none yet

## S8-W5 — Mobile: Shipments list table only shows Shipment Number + Date
- **Status:** open (new in r4)
- **Story:** story-8
- **Module:** Admin / Shipments
- **First found:** r4 (2026-03-11)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments`
- **Viewport:** 375x812 mobile
- **Description:** At mobile width, shipments table only shows Shipment Number and Date columns. Type, From/To Location, Status, Total Items, Quick Actions all hidden. Users cannot see shipment status or route on mobile.
- **Fix applied:** none yet

## S8-W6 — Activity log not auto-refreshing after status changes
- **Status:** open (same pattern as S6-W4)
- **Story:** story-8
- **Module:** Admin / Shipment Detail
- **First found:** r4 (2026-03-11)
- **Last seen:** r4 (2026-03-11)
- **Page:** `/en/admin/shipments/[id]`
- **Description:** After Ship or Mark as Delivered, the activity log section does not update until page reload. Entries ARE persisted but not live-refreshed. Same root cause as S6-W4 (order activity log).
- **Fix applied:** none yet

## S9-B1 — Assembly order detail breadcrumb shows raw UUID
- **Status:** open (PERSISTS from r1)
- **Story:** story-9
- **Module:** Admin / Assembly Detail
- **First found:** r1 (2026-03-08)
- **Last seen:** r2 (2026-03-11)
- **Page:** `/en/admin/semi-mounts/assembly-orders/{uuid}`
- **Description:** Breadcrumb shows raw UUID (e.g., 481b01a8-13de-4b7c-ae42-c0b096206c81) instead of the order number (SM-20260311-5555). Same class of bug as S0-B2 and S8-W2.
- **Fix applied:** none yet

## S9-W1 — Assembly order status not translated in Hebrew locale
- **Status:** open (new in r2)
- **Story:** story-9
- **Module:** Admin / Assembly Orders (i18n)
- **First found:** r2 (2026-03-11)
- **Last seen:** r2 (2026-03-11)
- **Page:** `/he/admin/semi-mounts/assembly-orders`
- **Description:** Status values "completed"/"pending" shown in English in Hebrew locale. Column header "סטטוס" is translated but values are not.
- **Fix applied:** none yet

## S12-B1 — Supplier flow interrupted by unstable auth/session routing
- **Status:** open (not reproduced in r2)
- **Story:** story-12
- **Module:** Supplier Auth / Routing
- **First found:** r1 (2026-03-11)
- **Last seen:** r1 (2026-03-11)
- **Page:** `/en/supplier/*`
- **Description:** During supplier dashboard→order navigation, session intermittently redirects to login or flips back to admin context, breaking continuous supplier workflow.
- **Fix applied:** none yet
- **Note (r2):** Not reproduced in r2 which focused on admin-side CRUD. May be intermittent or related to cross-portal session switching.

## S12-B2 — Edit form missing Order Items section
- **Status:** open (PERSISTS from r2)
- **Story:** story-12
- **Module:** Admin / Supplier Orders Edit
- **First found:** r2 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Page:** `/en/admin/supplier-orders/{id}/edit`
- **Description:** The edit form for supplier orders does not include the Order Items section. Only supplier, priority, expected delivery, ship-to, and notes are editable. Items cannot be modified after initial creation.
- **Fix applied:** none yet

## S12-B3 — Edit form resets priority to default on save
- **Status:** open (new in r3)
- **Story:** story-12
- **Module:** Admin / Supplier Orders Edit
- **First found:** r3 (2026-03-11)
- **Last seen:** r3 (2026-03-11)
- **Page:** `/en/admin/supplier-orders/{id}/edit`
- **Description:** After creating an order with "Urgent" priority and saving via edit form without changes, priority changed to "High". Edit form appears to not correctly read/persist the current priority value, defaulting instead.
- **Fix applied:** none yet

## S13-W1 — Threads section missing from supplier order detail
- **Status:** open
- **Story:** story-13
- **Module:** Supplier / Order Detail
- **First found:** 2026-03-12
- **Page:** `/en/supplier/orders/{uuid}`
- **Description:** No Threads section on supplier order detail page. Test plan expects per-order communication hub. Supplier must use global Inbox for all messaging.
- **Fix applied:** none yet

## S13-W2 — Mobile Orders tabs truncated, no scroll affordance
- **Status:** open
- **Story:** story-13
- **Module:** Supplier / Orders List
- **First found:** 2026-03-12
- **Viewport:** mobile 375x812
- **Page:** `/en/supplier/orders`
- **Description:** Status tabs clip at right edge ("Shippe...") with no scroll indicator or fade mask. Same pattern found on Inventory tabs (S13-W4). Affects Orders and Inventory pages at min.
- **Fix applied:** none yet

## S13-W3 — Order detail timeline clipped on mobile
- **Status:** open
- **Story:** story-13
- **Module:** Supplier / Order Detail
- **First found:** 2026-03-12
- **Viewport:** mobile 375x812
- **Page:** `/en/supplier/orders/{uuid}`
- **Description:** Timeline stages overflow right edge at 375px. "Shipped" label cut off, "Complete" stage invisible. No horizontal scroll affordance.
- **Fix applied:** none yet

## S13-W5 — Supplier nav brand wraps to 2 lines at 1024px
- **Status:** open
- **Story:** story-13
- **Module:** Supplier / Navigation
- **First found:** 2026-03-12
- **Viewport:** tablet 1024x768
- **Description:** "Supplier Portal" subtitle in nav header wraps to 2nd line at 1024px due to space pressure from 8 nav items + utility icons. All links still fit; brand presentation inconsistent.
- **Fix applied:** none yet

## S15-B1 — Dashboard "Low stock items" card clipped off-screen at mobile
- **Status:** open
- **Story:** story-15
- **Module:** Admin / Dashboard
- **First found:** 2026-03-12
- **Viewport:** mobile 375×812
- **Page:** `/en/admin`
- **Description:** Third dashboard metric card ("291 Low stock items") is positioned at `left: 420px` in a 375px viewport. Parent container has `overflow: hidden`. Card is completely invisible and inaccessible at mobile. Desktop and tablet show it correctly.
- **Fix applied:** none yet

## S15-B3 — Mobile nav drawer: Activity Log and Trash unreachable
- **Status:** open
- **Story:** story-15
- **Module:** Admin / Navigation
- **First found:** 2026-03-12
- **Viewport:** mobile 375×812
- **Page:** Any — hamburger menu
- **Description:** In the mobile nav drawer, Automations (top:801px), Activity Log (top:841px), and Trash (top:881px) are at/below the 812px viewport bottom. Drawer has `overflow-y: visible` — no scrolling possible. Last 3 nav items completely unreachable via hamburger menu.
- **Fix applied:** none yet

## S15-B2 — Locations type filter tabs cramped with icon/text overlap at mobile
- **Status:** open
- **Story:** story-15
- **Module:** Admin / Locations
- **First found:** 2026-03-12
- **Viewport:** mobile 375×812
- **Page:** `/en/admin/locations`
- **Description:** 7 location type tabs in 343px container with `overflow-x: visible`. Icons and text labels visually overlap. "Repair Shop" tab is clipped. Confirmed by DOM: scrollWidth 365px > clientWidth 343px with overflow:visible.
- **Fix applied:** none yet

## S2-W1 — Status filter missing 'Returned' option in Orders list
- **Status:** open
- **Story:** story-2
- **Module:** Admin / Orders List → Filters
- **First found:** r2 (2026-03-12)
- **Last seen:** r2 (2026-03-12)
- **Page:** `/en/admin/orders` → Filters → Status dropdown
- **Description:** Status filter dropdown has 7 options + All but no "Returned". Order detail status dropdown correctly includes all 8 statuses. Filter is inconsistent.
- **Fix applied:** none yet

## S2-W2 — No "Order created" entry in activity log
- **Status:** open
- **Story:** story-2
- **Module:** Admin / Order Detail → Activity Log
- **First found:** r2 (2026-03-12)
- **Last seen:** r2 (2026-03-12)
- **Page:** `/en/admin/orders/{id}`
- **Description:** After creating an order, activity log shows "No activity recorded yet" until the first status change. Test 2.13.2 expects an "Order created" entry.
- **Fix applied:** none yet

## S0-B11 — Supplier order number link missing locale prefix
- **Status:** open
- **Story:** story-0
- **Module:** Admin / Supplier Orders
- **First found:** r9 (2026-03-12)
- **Last seen:** r9 (2026-03-12)
- **Page:** `/en/admin/supplier-orders`
- **Description:** Order number link in supplier orders list uses `/admin/supplier-orders/{uuid}` instead of `/en/admin/supplier-orders/{uuid}`. Clicking the link fails to navigate to the detail page — redirects back to the list. Direct navigation with correct URL works fine.
- **Fix applied:** none yet
