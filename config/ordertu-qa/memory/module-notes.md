# Module Notes — Testing Cheat Sheet

Quick reference per module. Updated by QA agents after each run.

## Dashboard (`/en/admin`)
- Stats cards: Revenue, Orders, In Stock, Pending Shipments
- Quick action buttons: Create Order, Create Intake Document, Create Shipment
- Recent Threads section (empty state: "No threads yet")
- Greeting is time-sensitive ("Good Evening" etc.)
- **i18n issue (r8):** Greeting and "In Stock" not translated in Hebrew (S0-B9, S0-B10)

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
- **Filters dialog:** Location, Status (All/Available/Reserved/Sold/Damaged), Category, Supplier — **BUG: heading says "Title" / description says "Description" (S7-B1)**
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
- **Item count (r8):** 0 orders (data cleaned)
- **S0-W1 still unverifiable:** No orders to check duplicate chips

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
- **Item count (r8):** 0 shipments (data cleaned)
- Has table/card view toggles

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
- **S0-B8 (r8):** Search placeholder says "Placeholder" instead of proper text

## Users (`/en/admin/users`)
- **Item count (r8):** 5 users (Test User, Admin User 2, Test Buyer User, Test Distributor User, Test Supplier User)
- Role filter tabs with counts
- "Show deleted" toggle
- Table/card view toggles

## Semi Mounts > Assembly Orders (`/en/admin/semi-mounts/assembly-orders`)
- **Item count (r8):** 0 assembly orders
- Breadcrumb: Dashboard > Semi Mounts > Assembly

## Semi Mounts > Rings (`/en/admin/semi-mounts/rings`)
- **Item count (r8):** 3 ring bases (SM-RB-001, SM-RB-002, SM-RB-003) linked to SM-RING-001
- Size segments: sm, md, lg

## Semi Mounts > Crowns (`/en/admin/semi-mounts/crowns`)
- **Item count (r8):** 2 crown models (SM-CR-001, SM-CR-002)
- Types: hidden_halo, bezel

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
- **S1-B1 (r9):** PDP returns 404 — product visible in listing but detail route broken
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
- **S4-B1 (r10):** All product detail page routes return 404 — blocks ordering from catalog
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

