# QA Report — Story 1: Buyer Browses and Purchases

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Login:** buyer@example.com / 121212

## Scope

Complete buyer portal journey: catalog browsing, product detail, cart, checkout, order history, profile, inbox, and 404 handling.

---

## 1. Catalog (`/en/buyer/catalog`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.1.1 | Catalog page loads | Navigation, search, view toggle present | |
| 1.1.2 | Product count matches DB | Grid shows correct total count | If only 1 product, DB may need re-seeding |
| 1.1.3 | Product grid renders with images and prices | Prices or "Price TBD", placeholder for missing images | |
| 1.1.4 | In-stock badge per product | Shows stock count | |
| 1.1.5 | Pagination (URL `?page=2`) | Correct page rendering, no errors | |
| 1.1.6 | Pagination UI (page buttons, prev/next) | Navigation works, URL updates | |
| 1.1.7 | Search via search bar (live) | Instant results, no Enter required | |
| 1.1.8 | Search via URL (`?q=ring`) | Search box populated, results match | |
| 1.1.9 | Category filter via URL (`?category=ring`) | Correct filtering or "No products found" | |
| 1.1.10 | In-stock filter (`?inStock=true`) | Only in-stock products shown (fix #38: changed from `inStockOnly`) | |
| 1.1.11 | In-stock filter default OFF | No pre-selected filter, badge shows 0 active filters (fix #42) | |
| 1.1.12 | Advanced Filters panel opens | Panel expands on click (fix #41: changed from Radix Collapsible) | |
| 1.1.13 | Active filters badge shows correct count | Not "1" by default (fix #42) | |
| 1.1.14 | Table view toggle | Grid ↔ Table view switch works | |
| 1.1.15 | Recently Viewed section | Shows recently viewed products from localStorage | |
| 1.1.16 | Recently Viewed price consistency | Same price as in catalog grid (not $0.00) | Known issue from r6 |
| 1.1.17 | Pagination + in-stock filter combined | Correct counts — filter applied pre-query, not post-fetch (fix #39) | |
| 1.1.18 | PostgREST search injection safety | Special chars (`,`, `(`, `)`) in search don't crash | Sanitized via sanitizeSearchQuery (fix #53) |

---

## 2. Product Detail Page (PDP)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.2.1 | PDP loads via product link | `/en/buyer/catalog/{uuid}` renders correctly | |
| 1.2.2 | Product name, description, images | All displayed | |
| 1.2.3 | Price display | Catalog price or "Price TBD" if null | |
| 1.2.4 | "Made to Order" badge (if applicable) | Yellow badge shown | |
| 1.2.5 | Metal Type dropdown | Options populated from product_option_values | Known issue: may be empty if no option values |
| 1.2.6 | Ring Size dropdown | Options populated | |
| 1.2.7 | Center Stone selector (Natural / Lab-Grown) | Toggle buttons visible | |
| 1.2.8 | Quantity stepper (−/1/+) | Min 1, − disabled at 1 | |
| 1.2.9 | Special Instructions field | Optional textarea present | |
| 1.2.10 | Add to Cart from PDP (with valid options) | Item added, toast confirmation | |
| 1.2.11 | Add to Cart validation (required options missing) | Error feedback shown (not silent failure) | Known issue: silent failure if Metal Type empty |
| 1.2.12 | "Ready to Ship" combinations displayed | Available DN-coded items shown with specs | |

---

## 3. Cart

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.3.1 | Cart drawer opens on cart icon click | Right-side sheet | |
| 1.3.2 | Cart empty state | "Your cart is empty" with icon and "Continue Shopping" | |
| 1.3.3 | Cart badge count updates on add | Badge number increments | |
| 1.3.4 | Cart items show correct details | Product name, options, quantity, price | |
| 1.3.5 | Quantity controls in cart | +/− buttons, quantity updates | |
| 1.3.6 | Remove item from cart | Item removed, badge decrements | |
| 1.3.7 | "Saved for Later" section | Items from previous sessions displayed | |
| 1.3.8 | Move to/from "Saved for Later" | Toggle between cart and saved | |
| 1.3.9 | Cart total calculation | Sum of (price × qty) for all items | |
| 1.3.10 | "Proceed to Checkout" button | Present when items in cart | |

---

## 4. Checkout

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.4.1 | Checkout dialog opens | "Complete Your Order" modal | |
| 1.4.2 | Order summary shows items and total | Correct items, prices, total | |
| 1.4.3 | Delivery method options | Delivery, Pickup, Shipping radio buttons | |
| 1.4.4 | Address fields (pre-filled if returning customer) | Name, phone, address | |
| 1.4.5 | "Place Order" submits | Toast: "Order placed successfully!" | |
| 1.4.6 | Cart cleared after order | Badge disappears, cart empty | |
| 1.4.7 | Ghost order cleanup on failure | Orphaned orders deleted on any failure path (fix #40) | |

---

## 5. Orders (`/en/buyer/orders`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.5.1 | Orders list page loads | Table with Order #, Date, Items, Total, Status, Payment | |
| 1.5.2 | Empty state | "No orders yet" with "Catalog" link | |
| 1.5.3 | Order status filter dropdown | "All Orders" dropdown works | |
| 1.5.4 | Payment status filter dropdown | "All Payments" dropdown works | |
| 1.5.5 | Order detail page | Items, delivery info, timeline, payment status | |
| 1.5.6 | Order timeline | Pending → Confirmed → Processing → Ready → Shipped → Delivered | |
| 1.5.7 | Payment status badges | Pending (yellow), Partial (orange), Paid (green), Overpaid (blue) | fix #73 for overpaid |

---

## 6. Profile (`/en/buyer/profile`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.6.1 | Profile loads | "My Profile — Welcome back, {name}" | |
| 1.6.2 | Stat cards: Total Orders, Pending, Completed, Total Spent | Correct counts | |
| 1.6.3 | Recent orders section | Shows recent orders if any | |

---

## 7. Inbox (`/en/buyer/inbox`)

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.7.1 | Inbox loads | Thread list or "No threads found" with "New Thread" button | |
| 1.7.2 | "New Thread" button | Opens creation dialog (fix #44) | |
| 1.7.3 | Thread detail at `/en/buyer/inbox/{id}` | Thread content renders (fix #71: moved from /threads/) | |
| 1.7.4 | Buyer isolation | Only buyer's own threads visible | |
| 1.7.5 | Buyer "Resolve" button | Present (design decision pending — WARN) | |

---

## 8. Navigation & Error Handling

| # | Test | Expected | Notes |
|---|------|----------|-------|
| 1.8.1 | 404 for invalid product UUID | Custom buyer 404: "Page Not Found" with "Browse Catalog" + "My Orders" | |
| 1.8.2 | Cross-portal access blocked | `/en/admin/*` redirects to `/en/buyer/catalog` | |
| 1.8.3 | Language toggle (en ↔ he) | Switches locale, URL updates | |
| 1.8.4 | Notification bell | Shows unread count, dropdown with All/Unread tabs | |

---

## Summary Template

| Metric | Count |
|--------|-------|
| **Total Tests** | 55 |
| **Passed** | — |
| **Failed** | — |
| **Warnings** | — |
