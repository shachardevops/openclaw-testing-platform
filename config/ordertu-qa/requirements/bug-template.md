# Bug Report Template for Claude Code

When reporting a bug, use this exact format so Claude Code can parse, locate, and fix the issue efficiently.

## Format

```markdown
### 🐛 BUG {severity} — {BUG-ID} — {Short Title}

**Module:** {Module name — e.g., Products, Orders, Inventory}
**Page:** `{URL path}` — e.g., `/en/admin/products/[id]`
**Component:** {React component if identifiable — e.g., ProductEditForm, OrderSummaryCard}

**Steps to Reproduce:**
1. Navigate to {exact URL}
2. {Click/type/scroll action with exact element — button text, input label}
3. {What triggers the bug}

**Expected Result:**
{What should happen — be specific: "Form submits and redirects to order list with success toast"}

**Actual Result:**
{What actually happens — be specific: "Form shows spinner for 3s then returns to form with no error. Console shows: TypeError: Cannot read property 'id' of undefined at OrderForm.jsx:142"}

**Visual Context:**
{Describe the page state — what elements are visible, any error text shown, layout issues}

**Console Errors:**
```
{Exact error text from browser console, if any}
```

**Likely Cause:**
{Your best guess — e.g., "The supplier dropdown returns null when no supplier is selected, but OrderForm.jsx expects an object with .id property"}

**Suggested Fix:**
{Specific suggestion — e.g., "Add null check in OrderForm.jsx handleSubmit before accessing supplier.id. Consider: `const supplierId = supplier?.id ?? null`"}

**Regression?** {Yes — worked in r{N} | No — new bug | Unknown}
**Persists?** {Yes — from r{N} | No — first occurrence}
```

## Examples

### Good Bug Report (Claude Code can fix this)

```markdown
### 🐛 BUG P2 — S2-B1 — Order status not updating after payment confirmation

**Module:** Orders
**Page:** `/en/admin/orders/[orderId]`
**Component:** OrderStatusTimeline, PaymentConfirmDialog

**Steps to Reproduce:**
1. Navigate to `/en/admin/orders` and click on order ORD-260309-0001
2. Click "Confirm Payment" button in the order actions bar
3. In the confirmation dialog, click "Confirm"
4. Dialog closes, page reloads

**Expected Result:**
Order status should change from "Pending Payment" to "Paid". Timeline should show a new "Payment Confirmed" event.

**Actual Result:**
Dialog closes but status remains "Pending Payment". No timeline event added. Refreshing the page still shows "Pending Payment". However, the payment record IS created in the payments tab.

**Console Errors:**
```
PATCH /api/orders/abc123/status 422 - {"error":"Invalid transition: pending_payment -> paid"}
```

**Likely Cause:**
The order status machine doesn't allow direct `pending_payment -> paid` transition. Might need an intermediate state or the transition name might be wrong (e.g., should be `confirm_payment` not `paid`).

**Suggested Fix:**
Check `lib/order-state-machine.ts` for allowed transitions from `pending_payment`. Either add `paid` as valid target or use the correct transition action name in `PaymentConfirmDialog.tsx` `onConfirm` handler.

**Regression?** No — new bug (payment flow not tested in previous runs)
**Persists?** No — first occurrence
```

### Bad Bug Report (not actionable)

```markdown
- 🐛 BUG — Payment doesn't work
```

This tells Claude Code nothing — no URL, no steps, no error, no fix direction.

## Severity Guide

| Level | When to Use | Example |
|-------|------------|---------|
| P1 Blocker | User cannot complete a core workflow | "Cannot create any orders — submit button crashes" |
| P2 Critical | Feature broken but workaround exists | "Payment confirmation doesn't update status, but manual DB update works" |
| P3 Major | UX/visual issue affecting usability | "Breadcrumb shows UUID instead of order number" |
| P4 Minor | Cosmetic, no functional impact | "Button text says 'Sumbit' instead of 'Submit'" |
