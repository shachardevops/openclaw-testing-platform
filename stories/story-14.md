# QA Report — Story 14: Security & Access Control

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Users:** test@example.com (admin), supplier@example.com, buyer@example.com, distributor@example.com / 121212

## Scope

Security audit verification: auth checks on server actions, RLS policies, XSS protection, input validation, access control, SECURITY DEFINER functions.

---

## 1. Server Action Auth Checks (requireAdmin)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.1.1 | `getActivityLog()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.2 | `getActivityLogList()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.3 | `getSemiMountCrownsList()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.4 | `getSemiMountRingsList()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.5 | `addSupplierOrderItem()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.6 | `deleteSupplierOrderItem()` requires admin | Non-admin gets auth error (fix #52) | |
| 14.1.7 | `getDeletedEntities()` requires admin | Non-admin gets auth error (fix #85) | |
| 14.1.8 | `createStonePricing()` requires admin | Non-admin gets auth error (fix #86) | |
| 14.1.9 | `performRestore()` requires admin | Non-admin gets auth error (fix #100) | |
| 14.1.10 | `getCrownDetail()` / `getRingDetail()` requires admin | Non-admin gets auth error (fix #81) | |

---

## 2. PostgREST Search Injection

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.2.1 | Catalog search with `,` character | No crash, chars stripped (fix #53) | |
| 14.2.2 | Catalog search with `()` characters | No crash, chars stripped (fix #53) | |
| 14.2.3 | Crowns search with `.` character | No crash, chars stripped (fix #53) | |
| 14.2.4 | Rings search with `*:` characters | No crash, chars stripped (fix #53) | |
| 14.2.5 | Orders search injection (pre-existing) | KNOWN GAP: not yet sanitized | |
| 14.2.6 | Products search injection (pre-existing) | KNOWN GAP: not yet sanitized | |
| 14.2.7 | Inventory search injection (pre-existing) | KNOWN GAP: not yet sanitized | |
| 14.2.8 | Users search injection (pre-existing) | KNOWN GAP: not yet sanitized | |

---

## 3. XSS Protection

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.3.1 | Rich text sanitized via DOMPurify | `<script>` tags stripped (fix #56, #60) | |
| 14.3.2 | `<iframe>`, `<style>`, `<object>`, `<embed>`, `<form>` stripped | All dangerous tags removed | |
| 14.3.3 | `on*` event handlers stripped | e.g., `onclick`, `onerror` removed | |
| 14.3.4 | `javascript:` URIs stripped | No JS execution via links | |
| 14.3.5 | Comment copy uses `stripHtml()` | Not `innerHTML` (fix #57) | |
| 14.3.6 | Thread preview uses `stripHtml()` + `stripMentionSyntax()` | No raw HTML in previews (fix #50) | |

---

## 4. Soft Delete & Restore Security

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.4.1 | `performRestore()` validates UUID format | `isValidUUID()` on entityId and deletionReasonId (fix #105) | |
| 14.4.2 | Restore only works on deleted entities | `.not("deleted_at", "is", null)` guard (fix #105) | |
| 14.4.3 | Restore cross-checks deletion_reasons | Matches entityType + entityId + restored_at IS NULL (fix #105) | |
| 14.4.4 | Restore returns generic error messages | No raw DB errors exposed (fix #105) | |
| 14.4.5 | Notes capped at 500 characters | `notes?.slice(0, 500)` (fix #105) | |
| 14.4.6 | User deletion only via dedicated function | `user` NOT in ENTITY_TABLE_MAP (fix #87) | |
| 14.4.7 | `deleteUser()` uses `requireAdmin()` | Admin role verified | |
| 14.4.8 | `restoreUser()` uses `requireAdmin()` | No redundant auth call (fix #88) | |

---

## 5. RLS Policies

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.5.1 | Activity log SELECT uses `is_admin()` | Not inline subquery (fix #54) | |
| 14.5.2 | Thread comments filtered by role | Non-admin cannot see internal comments | is_internal feature removed (fix #70) but RLS still clean |
| 14.5.3 | Thread SELECT includes `created_by = auth.uid()` | Creator can see own threads (fix #43) | |
| 14.5.4 | Thread preview hides internal notes for non-admin | RLS-level filtering | N/A — feature removed |
| 14.5.5 | Supplier data scoped to supplier's location(s) | Supplier only sees own data | Known issue: getSupplierLocations() RLS (#17) |
| 14.5.6 | Distributor data scoped to distributor's location(s) | Distributor only sees own inventory | |
| 14.5.7 | Buyer cannot access admin routes | Middleware redirects | |

---

## 6. SECURITY DEFINER Functions

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.6.1 | `is_thread_participant()` has `SET search_path = public` | fix #55 | |
| 14.6.2 | `get_thread_coparticipant_ids()` has `SET search_path = public` | fix #55 | |

---

## 7. Cross-Portal Access Control

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.7.1 | Supplier accessing `/en/admin/*` | Redirected to `/en/supplier` | |
| 14.7.2 | Buyer accessing `/en/admin/*` | Redirected to `/en/buyer/catalog` | |
| 14.7.3 | Distributor accessing `/en/admin/*` | Redirected to `/en/distributor` | |
| 14.7.4 | Supplier accessing unauthorized thread URL | 404 | |
| 14.7.5 | Buyer accessing distributor routes | Redirected | |
| 14.7.6 | Direct URL to non-existent entity | 404 with proper layout | |
| 14.7.7 | User detail page UUID validation | Invalid UUID returns notFound() (fix #99) | |
| 14.7.8 | Admin accessing `/en/distributor` sees empty portal | No data leak, but no redirect either (WARN) | |

---

## 8. Deletion Reasons & Audit Trail

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 14.8.1 | `deletion_reasons` CHECK includes 'user' | fix #84: was silently failing | |
| 14.8.2 | `deleteUser()` creates deletion_reasons entry | fix #93: users appear in Trash | |
| 14.8.3 | `restoreUser()` marks restoration in deletion_reasons | restored_at + restored_by set | |
| 14.8.4 | Deletion reason cross-checked on restore | entityType + entityId match (fix #105) | |

---

## 9. Known Security Gaps (Not Yet Fixed)

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| 14.9.1 | PostgREST search injection in orders/products/inventory/users/locations/supplier-orders queries | OPEN | Apply `sanitizeSearchQuery()` |
| 14.9.2 | Shipments mutations use `supabase.auth.getUser()` instead of `requireAuth()` | OPEN | Should use centralized auth |
| 14.9.3 | `thread_comments` DELETE policy allows hard delete | OPEN | Should enforce soft delete |
| 14.9.4 | `thread_attachments` missing UPDATE policy | OPEN | No update protection |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 52 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
