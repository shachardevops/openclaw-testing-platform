# Module Notes — Testing Cheat Sheet

Quick reference per module. Updated by QA agents after each run.

## Dashboard (`/en/admin`)
- Stats cards: Revenue, Orders, In Stock, Pending Shipments
- Quick action buttons: Create Order, Create Intake Document, Create Shipment
- Recent Threads section — shows last 5 threads with unread badges
- Greeting is time-sensitive ("Good Evening" etc.)
- **i18n FIXED (story-16 r1):** S0-B9 and S0-B10 fixed — Hebrew greeting and "In Stock" now properly translated
- **Mobile (375px) issue:** "Low stock items" stat card label clips to "Low stock i" (S16-W1)
- **S11-B1 (story-11 r1):** "Processing" count in Needs Attention card is stale — shows 2 but orders are "Confirmed". Likely query bug.

## Products (`/en/admin/products`)
- **Item count (r8):** 1 product (SM-RING-001, "Semi Mount Demo Ring") — data was cleaned
- **Detail page sections:** Basic Info, Classification, Stone Config (center stone prefs, shapes, carat range), Options (Metal Type: 6 values, Ring Size: 11 values), Status, Media (up to 10 images), Pricing (Reference), CAD/Mould Files, Notes, Variants, Inventory
- **S0-B7 FIXED (r8):** Product code route now resolves correctly

## Inventory (`/en/admin/inventory`)
- **Item count (r3/story-7):** 578 items (28 pages × 20 + 18), Page 1 of 29
- **All items dated:** 03/11/2026
- **Status breakdown:** 577 Available, 1 Reserved (DN9277)
- **Columns:** Select, Item ID, Model, SKU, Product, Location (sortable), Status, Center Stone, Side Stones, Created At (sortable), Open Menu
- **Row context menu:** Edit, Delete
- **Search:** Live/instant filtering by DN code
- **Filters dialog:** Location, Status (All/Available/Reserved/Sold/Damaged), Category, Supplier — **S7-B1 FIXED (story-16 r1): Now shows "Inventory Filters" and proper description**
- **Product types:** CHAIN, RING, BANGLE, EARRINGS, BRACELET, PENDANT, NECKLACE
- **Detail page sections:** DN heading, status badge, product name, Barcode, Center Stones table, Side Stones table, Movement History, Item Information (Model/SKU/Certificate/Intake), Weight And Value (Gross Gold/Net Gold/Gold Value/Cost/Selling), Location, Dates
- **Center stones empty state:** Shows "Empty" heading + "Empty Description" paragraph — placeholder text (S7-B2)
- **Intake field:** Shows raw UUID (not human-readable intake reference) — persists from r2
- **Sub-menu:** Stock Count link
- **Stock Count locations:** חנות דגל (store: 0), מחסן ראשי (warehouse: 584)
- **Stock Count features:** Scan DN Code, Progress counter, Match/Sold Or Reserved/Issues/Pending counters, Scanned/Not Yet Scanned sections, Batches, Share/Leave/Cancel, Complete & Generate Report, Export to Shipment, Export to Order

## Intake (`/en/admin/intake`)
- **Item count (r8):** 0 documents (data cleaned)
- Stats cards: Total intakes, Last 30 days, By type breakdown (PO, Return, Transfer, Adjustment, Initial Stock)
- **S0-B2 still unverifiable:** No documents to check breadcrumb UUID bug

## Supplier Orders (`/en/admin/supplier-orders`)
- **Item count (r2/story-12):** 1 order (SO-202603-00001, status: Sent)
- **S0-W1:** Recent supplier chips work correctly — only 1 supplier so no duplicate check needed
- **story-12 r2 full CRUD:** Create form tested end-to-end (supplier selection, priority toggle, date picker, Ship To switching, warehouse selection, Add Item dialog with product variant, Notes section, Order Summary live updates). Save as Draft → Edit → Send to Supplier lifecycle complete.
- **BUG S12-B2 (P3):** Edit form does NOT include Order Items section — only metadata (supplier, priority, delivery, ship-to, notes) editable. Items are frozen after creation.
- **Hebrew locale (r2):** Fully translated — list columns, status badges, priority labels, create form labels, Ship To options all in Hebrew with correct RTL layout.
- **Mobile (375x812):** Sidebar collapses (hamburger), table shows only Order Number + Supplier + partial Status. Bottom buttons cramped (S12-W3). Progress stepper labels truncated (S12-W5).
- **Tablet (1024x768):** Sidebar visible, table mostly readable but Actual Cost and Created At columns cut off (S12-W8). Create form Ship To "Another Supplier" wraps to 2 lines (S12-W9).
- **Add Item dialog:** Product tab works with category filters, variant selection (metal type, ring size). Stones tab confirmed working (Natural/Lab Grown, 10 shapes, Carat/Color/Clarity, quantity). Semi-Mount tab confirmed working (Crown/Ring, model selector, quantity, notes). Product images still broken (S6-W2 pattern).
- **BUG S12-B3 (P3) — r3:** Edit form resets priority to default ("High") on save. Urgent priority set during creation reverted after edit save. Edit form likely doesn't load current priority value.
- **r3 responsive notes:** "Another Supplier" Ship To label wraps at both mobile AND tablet with sidebar. Stepper "In Progress" truncates on mobile. Table columns cut off at smaller viewports.

## Supplier Portal Auth/Routing (`/en/supplier/*`)
- **story-12 r1 bug (S12-B1):** supplier dashboard→order navigation can intermittently bounce to login/admin context.
- **story-12 r2:** Not reproduced (admin-side focused). May be intermittent or related to cross-portal session switching.

## Orders (`/en/admin/orders`)
- **Item count (r8):** 0 orders (data cleaned)
- **Item count (r5/story-6):** 2 orders (ORD-202603-00001, ORD-202603-00002) created during QA
- Has table/card view toggles
- **Card view empty state (r5):** Now correctly shows "No Orders Found" (S6-W1 FIXED)
- **Product images in selection dialog:** Still broken (valigara.com CDN — S6-W2 PERSISTS)
- **Activity log (r5):** Does NOT auto-refresh after inline mutations (status change, payment). Only refreshes after full page reload (e.g., save edit redirect). See S6-W4.
- **Responsive behavior (r5):** Mobile (375px): hamburger menu, full-width cards, horizontal-scroll table. Tablet (768px): sidebar visible, 2-col cards, table all columns visible.
- **Tablet status row (r5):** At 768px, "($paid / $total)" text in status row overlaps Order Date column. See S6-W5.
- **Create Order tips:** Use `form.requestSubmit()` if dialog form Submit button doesn't respond. Product selection dialog opens via combobox click. Custom Item tab is separate from Product Selection.
- **Edit Order:** Inventory item qty is "Fixed" (cannot change). Custom item qty uses spinbutton (click cell → spinbutton activates). Live totals update on BLUR, not on each keypress.
- **Record Payment:** Quick-amount buttons (25%/50%/Full) work correctly. ILS conversion shown live. Payment status auto-updates based on paid/total ratio.

## Shipments (`/en/admin/shipments`)
- **Item count (r4/story-8):** 2 shipments (SHP-202603-00001 Transfer Delivered, SHP-202603-00002 Consignment Delivered)
- Has table/card view toggles
- **F-8 FIXED (r4):** UnifiedItemSelector now renders correctly; useLocale hook restored
- **Create flow:** Select Type → From Location (loads items) → To Location → Add items (click card or scan barcode) → Create Shipment
- **Barcode scan:** Type in "Search or scan barcode..." field + Enter → auto-adds matching item
- **Types available:** Transfer, Sale, Return, Consignment, Disposal (story says "supplier" but UI has "Disposal")
- **Status flow:** Pending → In Transit (Ship) → Delivered (Mark as Delivered)
- **Detail page sections:** Progress bar, Shipment Items table, Documents & Discussions, Activity Log, Locations, Type, Dates
- **Activity log:** Persists entries (created, status changes) but does NOT auto-refresh on inline mutations (needs page reload) — same as S6-W4
- **Quick actions (list):** Ship (Pending), Mark as Delivered (In Transit), Open Menu
- **Confirmation dialogs:** Ship and Deliver have confirmation dialogs with raw i18n keys as subtitles (S8-W1)
- **Breadcrumb issue (r4):** Shows "More" instead of "Shipments" on detail/edit pages (S8-W2)
- **Hebrew (r4):** Mostly translated. Untranslated: "Table view", "Card view", "Tracking" (S8-W4)
- **Mobile (375px):** Table only shows 2 columns (Shipment Number, Date). Status/Type/Locations hidden (S8-W5)
- **Tablet (768px):** Items table Price column truncated at right edge
- **Filters dialog:** Has Status, From Station, To Station dropdowns. Properly titled "Shipment Filters" with description.

## Stones (`/en/admin/stones`)
- Tabs: Center Stones, Side Stones
- **Item count (r8):** 0 stones (data cleaned)

## Metals (`/en/admin/metals`)
- Shows Pure Gold and Pure Platinum balances
- Balance by Location section

## Customers (`/en/admin/customers`)
- **Item count (r8):** 7 customers (seed data)
- Filters: Search, Customer Type, Status
- Types seen: retailer, individual, wholesaler

## Locations (`/en/admin/locations`)
- **Item count (r8):** 4 locations (Distributor Showroom, Flagship Store, Gold & Diamond Supplier, Main Warehouse)
- Type tabs: All, Warehouse, Store, Supplier, Client, Transit, Repair Shop
- **S0-B8 FIXED (story-11 r1):** Search placeholder now correctly says "Search locations..."

## Users (`/en/admin/users`)
- **Item count (r8):** 5 users (Test User, Admin User 2, Test Buyer User, Test Distributor User, Test Supplier User)
- Role filter tabs with counts
- "Show deleted" toggle
- Table/card view toggles

## Semi Mounts > Assembly Orders (`/en/admin/semi-mounts/assembly-orders`)
- **Item count (r2/story-9):** 1 assembly order (SM-20260311-5555, completed)
- Breadcrumb: Dashboard > Semi Mounts > Assembly
- **Detail page bug:** Breadcrumb shows raw UUID instead of order number (S9-B1, PERSISTS)
- **Hebrew i18n:** Status values (pending/completed) not translated (S9-W1)
- **Mobile (375px):** Actions column off-screen; detail page status badge truncated
- **Tablet (1024px):** All detail columns fit; breadcrumb UUID truncated with ellipsis
- **New assembly form:** 4-step flow: Product → Config → Components → Summary
  - Carat selection triggers size segment mapping (SM/MD/LG) and auto-filters components
  - Both crown + ring items must be selected before submit enabled
  - Mark as Finished dialog: location (required), DN, cert, prices, gold weights, labor, notes

## Semi Mounts > Rings (`/en/admin/semi-mounts/rings`)
- **Item count (r2/story-9):** 3 ring bases (SM-RB-001, SM-RB-002, SM-RB-003) linked to SM-RING-001
- Size segments: sm, md, lg
- **Post-assembly:** SM-RB-001 (sm) decreased from 3→2 On Hand after assembly
- **Mobile (375px):** Only 3 of 10 columns visible, "Size Segment" truncated (S9-W2)
- **Tablet (1024px):** "Available" column clipped at right edge (S9-W6)

## Semi Mounts > Crowns (`/en/admin/semi-mounts/crowns`)
- **Item count (r2/story-9):** 2 crown models (SM-CR-001, SM-CR-002)
- Types: hidden_halo, bezel
- **Post-assembly:** SM-CR-001 decreased from 2→1 On Hand after assembly
- **Mobile (375px):** Only 3 of 12 columns visible, "Carat Range" truncated (S9-W3)

## Automations (`/en/admin/automations`)
- Two sections: Andy Stone Value Calculator, Andy With DN Stone Value Calculator
- CSV upload + output format selection

## Activity Log (`/en/admin/activity-log`)
- Search + filters
- **Item count (r8):** 0 entries

## Inbox (`/en/admin/inbox`)
- "New Thread" button, search, filters (status, category), unread toggle
- **Item count (r8):** 0 threads
- **r11 (story-5) results:** 17 pass, 0 fail, 2 warnings
- Thread creation: modal dialog with Title, Description, Attachments fields
- Thread detail: heading, status badge (Open/Resolved), Pin/Unpin, Resolve/Reopen buttons
- Rich text editor: TipTap/ProseMirror with Heading 2/3, Bold, Italic, Underline, Strikethrough, Bullet/Ordered List, Align Left/Center/Right, Link, Undo/Redo, Attach files
- @mention autocomplete: shows Users and Locations matching typed text
- Message actions: Own messages → Copy, Edit, Delete, Reply; Others' messages → Copy, Reply only
- Participants panel: shows avatars + names, can remove non-owners. No "Add participant" UI.
- **Cross-portal visibility:** Admin sees ALL portal threads. Other roles see only their own threads.
- **Notification badge:** Increments on new cross-portal messages; bell icon opens notification panel
- **Thread categories:** "General" default category
- Emoji support: Unicode emoji renders correctly in messages

## Trash (`/en/admin/trash`)
- Search, type filter
- **Item count (r8):** 0 items

---

## BUYER PORTAL

## Buyer Catalog (`/en/buyer/catalog`)
- **Product count (r9):** 1 product (Semi Mount Demo Ring, SM-RING-001)
- **Default view (r9):** Table view (not grid) — may be localStorage persistence from prior session
- **Search:** Works correctly, debounced
- **Advanced Filters:** Category, Stock Status (In stock only), Price Range, Metal Type, Weight, Size/Length, Stone Type (center/side), Carat Range
- **"In stock only" toggle:** Defaults to OFF (test plan says ON)
- **Recently Viewed:** Shows up to 6 items from localStorage, includes stale deleted products
- **Stock status:** Only product shows "Out" (0 stock)
- **Price display:** Shows "$0.00" (catalog_price is null/0)
- **S1-B1 FIXED (story-11 r1):** PDP now loads correctly — tested with BANGLE AD001B. Metal type dropdown (6 options), pricing, quantity, Add to Cart all functional.
- **Grid/Table toggle:** Both buttons present, switching may not work properly
- **Gotchas:**
  - Advanced Filters button may timeout with ref-click; use JS evaluate fallback
  - Cart sheet doesn't open via automated button click (may need manual test)

## Buyer Orders (`/en/buyer/orders`)
- **Order count (r9):** 0 orders (data cleaned, no checkout flow testable)
- Search, status filter (All Orders), payment filter (All Payments)
- Empty state: "No orders yet" with "Catalog" link

## Buyer Profile (`/en/buyer/profile`)
- Stat cards: Total Orders, Pending Orders, Completed, Total Spent
- Account info: Name, Email, Role
- Recent Orders section with "View All" link
- **All stats show 0 / $0.00 (r9)** — correct for empty DB

## Buyer Inbox (`/en/buyer/inbox`)
- "New Thread" button, search, filter dropdowns, "Unread only" toggle
- **Thread count (r9):** 0 threads

---

## DISTRIBUTOR PORTAL

## Distributor Dashboard (`/en/distributor`)
- Stats: In Stock, Sold, Gold (g), Diamonds (ct)
- "X items sold — not yet ordered" banner with "Create Order" CTA button
- Quick Actions: Report Sale, Reports, Inventory, Catalog
- Materials Summary section (shows center stone breakdown when in-stock items exist)
- Recent Threads section
- Admin accessing /en/distributor sees 0 items (admin user has no distributor location assigned) — by design

## Distributor Inventory (`/en/distributor/inventory`)
- Shows items consigned to the distributor's location
- Status column: Available, Sold
- Columns: Item ID, Product, Status, Gold (g), Center Stone, Carat, Certificate
- Row checkbox selection supported (use JS `role=checkbox` click, not ref — avoids stale ref session collision)
- No "Return" button appears for Sold items (WARN-01)

## Distributor Report Sale (`/en/distributor/report-sale`)
- Shows Available items only
- Row checkbox → "N items selected" + "Mark as Sold" button
- "Mark as Sold" → Confirm dialog → "N items marked as sold" toast
- Empty state: "No items available to report" when all items are Sold

## Distributor Reports (`/en/distributor/reports`)
- Two sections: Materials Summary (current stock breakdown), Sold (historical breakdown)
- Sold section correctly reflects reported sales: Center Stones (Round/Fantasy) with ct values
- Materials Summary is empty when all items are sold

## Distributor Catalog (`/en/distributor/catalog`)
- Recently Viewed carousel shows up to 6 products
- Table/Grid view toggle
- Advanced Filters button
- **S4-B1 FIXED (story-11 r1):** Product detail pages now load correctly — same PDP as buyer with metal type, pricing, cart
- Add to Cart button shows "Max (N)" and is disabled when out of stock
- Cart dialog: two tabs — "Orders" and "Returns"

## Distributor Orders (`/en/distributor/orders`)
- Search + All Orders filter + All Payments filter
- Empty state: "No orders yet" with "Catalog" link
- **S4-B2 (r10):** /en/distributor/create-order route missing — redirects to admin dashboard

## Distributor Inbox (`/en/distributor/inbox`)
- "New Thread" button → "Create New Thread" dialog (Title, Description optional, Attachments optional)
- Thread created by distributor appears in admin inbox ✅
- Category tag shown in list: "General"

## Distributor Authentication Notes (r10)
- Distributor portal correctly redirects admin routes back to /en/distributor (middleware working)
- Session can be corrupted by stale ref clicks that cross admin/distributor context — use JS evaluate for checkbox interactions
- /en/distributor/create-order is not handled by distributor middleware → falls through to admin

## Buyer Hebrew/RTL (`/he/buyer/*`)
- **Mostly translated (r9):** Nav, titles, labels, table headers, dropdowns all in Hebrew
- **RTL layout works correctly**
- **Missing translations (r9):** "Open Cart" button, "Out" stock badge, "View details" button, "Grid view"/"Table view" tooltips


## Supplier Portal — story-13 (2026-03-12)
- **Dashboard:** Clean. Pipeline empty state ("All Caught Up") shows correctly after all orders ship. Notification bell count accurate.
- **Orders:** 6 tabs (All/Pending/Active/Shipped/Done/Cancelled). Full 6-column table at desktop/tablet. Mobile: 3 columns only, tabs clip.
- **Order Detail:** Full workflow: Start Work → status dropdown (CAD/Casting/Setting/Finished) → "Apply to all" shortcut. Fulfillment sidebar with progress bars. Missing: Threads section.
- **Intake New Form:** Live gold calculations (Stone Weight/Net Gram/Gold After Loss/Pure Gold). "Need stone" indicator shown when no center stone assigned. Auto-saves on submit → inventory item created immediately.
- **Shipments Wizard:** 3-step with proper guards (Next disabled until required). Step 1 supports group-by-order, Select All. Step 2: Destination* required, Carrier/Tracking optional. SOS-XXXXXX pattern for IDs.
- **Inventory:** Auto-updated by intake + shipment events. Item status lifecycle: available → In Transit. Gold balance auto-debited by intake (shows negative if no purchase recorded).
- **Transactions:** Auto-ledger entries created by intake ("Intake deduction: Xg 14K = Yg pure"). 4 manual transaction types available.
- **Inbox:** Thread list with unread badge, search, filter comboboxes, "Unread only" toggle. "New Thread" button present.
- **Profile:** Account info (name/email/phone/role), per-supplier notification preferences (4 toggles), theme+language preferences.

## Metals (`/en/admin/metals`)
- **Tested:** story-15 r1 (2026-03-12)
- **Summary cards:** Pure Gold, Pure Platinum with gram values
- **Balance by Location table:** Location name, Location Type badge, Pure Gold (g), Pure Platinum (g)
- **Current data:** Gold: -3.31g (supplier balance after outgoing), Platinum: 0.00g
- **Hebrew text:** "ספק זהב ויהלומים" location renders correctly
- **Mobile:** Cards reflow to single column. Table 349px in 301px container (overflow:auto). "Pure Platinum" header truncates to "Plat" at mobile.

## Automations (`/en/admin/automations`)
- **Tested:** story-15 r1 (2026-03-12)
- **Tools:** Andy Stone Value Calculator (CSV upload), Andy With DN Stone Value Calculator (CSV upload)
- **Each tool:** File dropzone + Select Output Format dropdown + Calculate Stone Values button
- **Mobile:** Clean stacking, full-width buttons. No issues.

## Activity Log (`/en/admin/activity-log`)
- **Tested:** story-15 r1 (2026-03-12)
- **Columns:** Date, User, Action (badge), Entity Type (badge), Entity Name (UUID/ref), Details (state transition)
- **Current data:** 13 rows (Mar 11, 2026). Actions: supplier order created/sent, shipment created/status changed, order created/updated/status changed
- **Filter button:** Filters sidebar panel
- **Search:** Real-time search
- **Pagination:** Page 1 of 1 (13 rows)
- **Tablet issue:** Table 866px in 718px. "Entity Name" header clips to "Entity N". Details column 148px off-screen.
- **Mobile issue:** Table 866px in 341px. Only Date + User visible without scroll.

## Trash (`/en/admin/trash`)
- **Tested:** story-15 r1 (2026-03-12)
- **State:** Empty — "Trash is empty, No deleted items found"
- **Controls:** Search field, "All types" filter dropdown
- **Navigation:** Unreachable via mobile hamburger menu (S15-B3) but accessible by direct URL

## Users (`/en/admin/users`)
- **Tested:** story-15 r1 (2026-03-12)
- **Users:** 5 — Test Supplier User (Supplier), Test User (Admin), Admin User 2 (Admin), Test Buyer User (Buyer), Test Distributor User (Distributor)
- **Columns:** Full Name (with external link icon), Email, Role badge, Assigned Locations (dropdown), Actions (⋯ menu)
- **Features:** Search, view toggle (table/grid), role filter tabs (5 tabs), Show deleted checkbox, Create User button
- **Mobile:** "Show deleted" checkbox is 44×44px (correct touch target). Table scrollable.
- **Tablet:** All columns visible. Name wraps 3 lines for "Test Supplier User" / "Test Distributor User" in narrow column.

## Locations (`/en/admin/locations`)
- **Tested:** story-15 r1 (2026-03-12)
- **Locations:** 4 — Distributor Showroom, Flagship Store (חנות דגל), Gold & Diamond Supplier (ספק זהב ויהלומים), Main Warehouse (מחסן ראשי)
- **Filter tabs:** All, Warehouse, Store, Supplier, Client, Transit, Repair Shop (7 tabs)
- **Table columns:** Name, Display Name, Location Type badge, Contact Person, Phone (+ more off-screen at tablet)
- **Hebrew display names render correctly**
- **Mobile bug:** 7 tabs cramped in 343px container, icons/text overlap (S15-B2)
- **Tablet:** All 7 tabs fit without overlap. ✅

## Customers (`/en/admin/customers`)
- **Tested:** story-15 r1 (2026-03-12)
- **Count:** 7 customers
- **Columns:** Customer (avatar+name+subtitle), Contact (email+phone), Type badge, Status badge, Tags (multi-chip), Actions (view/edit/delete)
- **Filter controls:** Search, Customer Type dropdown, Status dropdown
- **Tags pattern:** "premium vintage", "collector private", "VIP wholesale", "online e-commerce", "wholesale distributor", "chain multi-location", "luxury high-volume"
- **Mobile:** Table 892px in 301px container. Contact email truncates. Only Customer+Contact initially visible. Horizontal scroll (no indicator) to reach Type/Status/Tags/Actions.
- **Tablet:** Customer+Contact+Type+Status+Tags visible. Actions 190px off-screen (scroll needed).
