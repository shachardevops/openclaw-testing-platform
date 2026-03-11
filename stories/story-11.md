# QA Report — Story 11: Activity Log & Audit Trail

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** test@example.com / 121212

## Scope

Universal activity log: page-level list, entity-level sections, event logging across orders, shipments, users, and the dedicated Activity Log page.

---

## 1. Activity Log Page (`/en/admin/activity-log`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 11.1.1 | Page loads | DataTable renders with columns | |
| 11.1.2 | Empty state shows correct text | "No activity yet" title + description (fix #110: not raw "Title"/"Description") | |
| 11.1.3 | Empty state icon (History) | Correct icon displayed | |
| 11.1.4 | Search placeholder text | "Search activity log..." not "Placeholder" (fix #68) | |
| 11.1.5 | Breadcrumb shows "Activity Log" | Not raw slug "activity-log" (fix #69) | |
| 11.1.6 | StaleTime: near-instant refresh on navigate | staleTime: 5s (fix #120) | |
| 11.1.7 | Auto-refresh while on page | refetchInterval: 30s (fix #120) | |
| 11.1.8 | Columns: Event, Entity, Entity Name, Details, Performed By, Date | All present | |
| 11.1.9 | Pagination works | Pages navigate correctly | |
| 11.1.10 | Search by event name | Filters results | |
| 11.1.11 | Filter by entity type | Filter options include: order, shipment, user, etc. | |
| 11.1.12 | User entity type in filter | "User" option present (fix #118) | |
| 11.1.13 | Performer profiles resolved | Shows user names not UUIDs (fix #47: separate fetch + map) | |
| 11.1.14 | Auth required | requireAdmin() on queries (fix #52) | |

---

## 2. Order Activity Log Events

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 11.2.1 | Order creation logged | "Order created" event with order number | |
| 11.2.2 | Status change logged | "Order status changed" with from→to metadata (fix #66) | |
| 11.2.3 | No-op status change NOT logged | Edit save with same status doesn't create entry (fix #75) | |
| 11.2.4 | Payment recorded logged | "Payment recorded" with amount, method, totals (fix #65) | |
| 11.2.5 | Item edit logged | "Order items updated" event | |
| 11.2.6 | Activity log on order detail page | Timeline section shows all events | |

---

## 3. Shipment Activity Log Events

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 11.3.1 | Shipment creation logged | "Shipment created" event | |
| 11.3.2 | Status change logged | "Shipment status changed" with from→to (fix #26) | |
| 11.3.3 | Activity log on shipment detail page | Timeline section shows all events | |
| 11.3.4 | Events persist on reload | Not lost on page refresh (fix #77) | |

---

## 4. User Activity Log Events

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 11.4.1 | User creation logged | "User created" with full_name, email, role metadata (fix #118) | |
| 11.4.2 | User deletion logged | "User deleted" with user metadata (fix #118, #121) | |
| 11.4.3 | User restoration logged | "User restored" with user metadata (fix #118) | |
| 11.4.4 | Entity Name shows full_name/email fallback | Not truncated UUID (fix #121) | |
| 11.4.5 | Details column shows role for user events | Role displayed (fix #121) | |
| 11.4.6 | User entity color (teal) in Activity Log | Correct color coding (fix #118) | |
| 11.4.7 | User detail link from Activity Log | Links to `/admin/users/{id}` (fix #118) | |

---

## 5. Activity Log RLS & Security

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 11.5.1 | RLS uses is_admin() function | Not inline subquery (fix #54) | |
| 11.5.2 | Non-admin cannot access activity log | Server action returns auth error | |
| 11.5.3 | Performer profiles fetched separately | No PostgREST FK join issue (fix #47) | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 28 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
