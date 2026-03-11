# QA Report — Story 13: RTL, i18n & Localization

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

## Scope

Comprehensive RTL/i18n testing: Hebrew locale rendering, logical CSS properties, directional icons, translation completeness, entity identifier direction.

---

## 1. Global RTL Layout (`/he/admin`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.1.1 | Page direction is RTL | `dir="rtl"` on html/body | |
| 13.1.2 | Sidebar on right side | RTL layout reverses sidebar position | |
| 13.1.3 | Content flows right-to-left | Text alignment, reading order | |
| 13.1.4 | All sidebar labels translated | Full Hebrew nav (see story-0 list) | |
| 13.1.5 | URL uses `/he/` prefix | Locale routing correct | |

---

## 2. Logical CSS Properties

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.2.1 | Stone pricing table: `text-end` not `text-right` | fix #89: logical property | |
| 13.2.2 | Locations search icon: `start-3` not `left-3` | fix #89: logical property | |
| 13.2.3 | Crown/ring columns: `start-2`/`end-2` not `left-2`/`right-2` | fix #113 | |
| 13.2.4 | Badge positioning: `-end-1` not `-right-1` | fix #113 | |
| 13.2.5 | Breadcrumb indentation: uses logical properties | Consistent alignment | |
| 13.2.6 | No `left-*`/`right-*` in modified components | Use `start-*`/`end-*` everywhere | |
| 13.2.7 | `ms-auto`/`me-1` not `ml-auto`/`mr-1` | Logical margin | |
| 13.2.8 | `ps-9` not `pl-9` | Logical padding | |

---

## 3. Directional Icons

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.3.1 | ChevronRight in supplier order notes: `rtl:rotate-180` | fix #111 | |
| 13.3.2 | ChevronLeft/Right in CAD gallery dialogs: `rtl:rotate-180` | fix #113 | |
| 13.3.3 | ArrowRight in breadcrumbs/navigation: rotated in RTL | Points left in RTL | |
| 13.3.4 | Collapsible chevrons rotate correctly in both open/closed states | `rotate-90` + `rtl:rotate-180` compose | |

---

## 4. Entity Identifiers (dir="ltr")

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.4.1 | DN codes in inventory tables: `dir="ltr"` | Numbers read LTR | |
| 13.4.2 | Order numbers (ORD-xxx): `dir="ltr"` | Codes read LTR | |
| 13.4.3 | Shipment numbers (SHP-xxx): `dir="ltr"` | Codes read LTR | |
| 13.4.4 | Email addresses in trash table: `dir="ltr"` | fix #104 | |
| 13.4.5 | SKU codes: `dir="ltr"` | Product codes read LTR | |
| 13.4.6 | Entity identifiers in trash table: `dir="ltr"` | fix #104 | |
| 13.4.7 | UUID-based identifiers: `dir="ltr"` | If displayed anywhere | |

---

## 5. Translation Completeness

### 5a. Activity Log Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.1 | `activityLog.title` | en: "Activity Log", he: "יומן פעילות" | |
| 13.5.2 | `activityLog.search.placeholder` | en: "Search activity log...", he: translated | fix #68 |
| 13.5.3 | `activityLog.empty.title` | en: "No activity yet", he: "אין פעילות עדיין" | fix #110 |
| 13.5.4 | `activityLog.empty.description` | en: "Activity will appear here...", he: translated | fix #110 |

### 5b. Trash Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.5 | `trash.restore` / `trash.restoring` | Both locales | fix #108 |
| 13.5.6 | `trash.restoreSuccess` / `trash.restoreError` | Both locales | fix #108 |
| 13.5.7 | `trash.confirmRestore` / `trash.confirmRestoreDescription` | Both locales | fix #108 |
| 13.5.8 | `trash.search` / `trash.noResults` | Both locales | fix #108 |
| 13.5.9 | `trash.entityTypes.user` | Both locales | fix #108 |

### 5c. User Detail Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.10 | `user.notFound` | en: "User not found", he: translated | fix #106 |
| 13.5.11 | `user.fullAccess` | en: "Full access", he: translated | fix #106 |
| 13.5.12 | `user.passwordMinLength` | en: "Min. 8 characters", he: translated | fix #106 |

### 5d. Order & Payment Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.13 | `paymentStatus.overpaid` | Both locales | fix #73 |
| 13.5.14 | `order.filter.startDate` / `order.filter.endDate` | Both locales | fix #67 |

### 5e. Semi-Mount Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.15 | `common.product` / `common.productName` / `common.productCode` | Both locales | fix #114 |
| 13.5.16 | `common.location` / `common.itemId` | Both locales | fix #114 |
| 13.5.17 | `semiMount.viewCadImages` / `semiMount.uploadCadImage` | Both locales | fix #115 |
| 13.5.18 | `semiMount.assemblyOrders.orderTitle` | Both locales | fix #115 |

### 5f. Sidebar & Misc Keys

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.5.19 | `sidebar.toggleInventory` / `sidebar.toggleSemiMounts` | Both locales | fix #58 |
| 13.5.20 | `supplierOrders.items.selectBaseProduct` | Both locales | fix #58 |
| 13.5.21 | `mentions.typeToSearch` | Both locales | fix #62 |

---

## 6. Locale-Aware Formatting

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.6.1 | Dates use Intl.DateTimeFormat in Hebrew | Hebrew date format, not English | fix #114 |
| 13.6.2 | Currency displays correctly in both locales | $, ₪ symbols positioned correctly | |
| 13.6.3 | Number formatting respects locale | Comma/period separators | |

---

## 7. Navigation URL Locale Prefixes

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 13.7.1 | Supplier order form redirects include locale | `/${locale}/admin/supplier-orders/...` (fix #110) | |
| 13.7.2 | Stone Pricing link includes locale | `/${locale}/admin/settings/stone-pricing` (fix #97) | |
| 13.7.3 | Assembly orders list navigation includes locale | `/${locale}/admin/semi-mounts/assembly-orders` (fix #117) | |
| 13.7.4 | Assembly order detail navigation includes locale | `/${locale}/admin/semi-mounts/assembly-orders/${id}` (fix #80) | |
| 13.7.5 | Location card click includes locale | Uses `router.push` with locale | |
| 13.7.6 | Trash restore cache invalidation per entity type | Locale-independent cache keys | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 52 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
