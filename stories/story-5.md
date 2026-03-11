# QA Report — Story 5: Cross-Portal Threads

**Run:** r7
**Date:** 2026-03-09
**Environment:** http://localhost:3000
**Tester:** QA Agent (openclaw browser profile, claude-opus-4-6)
**Users:** test@example.com (admin), supplier@example.com, buyer@example.com, distributor@example.com / 121212

---

## Regression Summary vs. Run 3

| Bug from Previous Runs | Status in r7 |
|---|---|
| TC-5.03: @Mention returns "No results found" | FIXED in r3 — verified still passing |
| TC-5.21: Notifications panel didn't open | FIXED in r3 — verified still passing |
| TC-5.23: Silent login failure | FIXED in r3 — verified still passing |
| #70: is_internal feature removed | Confirmed removed — all N/A tests remain N/A |
| #71: Thread routes moved to /inbox/{id} | Confirmed — detail pages at /inbox/{id} |
| #72: User @mentions no longer link to inbox | Confirmed — renders as styled span |
| #62: @Mention "Type to search..." empty state | Confirmed — shows hint instead of "No results found" |
| #60: DOMPurify sanitization for rich text | Confirmed — regex replaced with DOMPurify |
| TC-5.17: Thread participant visibility (no UI hint) | Unchanged — no tooltip/hint added |
| TC-5.26: Buyer "Resolve" button (scope concern) | Unchanged — button still present |

---

## Test Execution

### TC-5.01 — Admin Creates Thread

| # | Check | Result | Notes |
|---|---|---|---|
| 5.01.1 | Navigate to /en/admin/inbox | PASS | Inbox page loads with thread list |
| 5.01.2 | Click "+ New Thread" button | PASS | "Create New Thread" dialog opens |
| 5.01.3 | Title field is required | PASS | Cannot submit with empty title |
| 5.01.4 | Description field is optional | PASS | Can create thread without description |
| 5.01.5 | Attachments section present (PDF/Images/Word, max 10MB) | PASS | File upload area shown in dialog |
| 5.01.6 | Create thread with title "Story 5 r7 - Cross-Portal Thread" | PASS | Toast: "Thread created successfully" |
| 5.01.7 | Thread appears immediately in admin inbox | PASS | Shows at top of list with timestamp |

---

### TC-5.02 — Admin Posts Message

| # | Check | Result | Notes |
|---|---|---|---|
| 5.02.1 | Open newly created thread detail | PASS | Thread detail view loads at /en/admin/inbox/{id} |
| 5.02.2 | Type a regular message in editor | PASS | Editor accepts text input |
| 5.02.3 | Post button disabled when editor is empty | PASS | Button grayed out with no content |
| 5.02.4 | Submit message | PASS | Message appears in thread |
| 5.02.5 | Author name displayed | PASS | "Test User" shown |
| 5.02.6 | Timestamp displayed | PASS | "less than a minute ago" format |
| 5.02.7 | Copy action available | PASS | Copy button present on message |
| 5.02.8 | Edit action available (own message) | PASS | Edit button present |
| 5.02.9 | Delete action available (own message) | PASS | Delete button present |
| 5.02.10 | Reply action available | PASS | Reply button present |

---

### TC-5.03 — @Mention Autocomplete

| # | Check | Result | Notes |
|---|---|---|---|
| 5.03.1 | Type "@su" in thread editor | PASS | Autocomplete dropdown appears |
| 5.03.2 | Users section shows matching users | PASS | "Test Supplier User -- supplier@example.com" listed |
| 5.03.3 | Locations section shows matching locations | PASS | Supplier location listed |
| 5.03.4 | Select user inserts mention into editor | PASS | @[Test Supplier User](user:...) inserted (fix #24, #62) |
| 5.03.5 | Mention rendered correctly in editor | PASS | Styled mention chip visible |

---

### TC-5.04 — @Mention Rendering

| # | Check | Result | Notes |
|---|---|---|---|
| 5.04.1 | User mentions render as styled span (not link) | PASS | @Test Supplier User is a styled span, not clickable link (fix #72) |
| 5.04.2 | Entity mentions (order, product) remain clickable links | PASS | Entity-type mentions are anchor tags |
| 5.04.3 | Mention styling consistent across portals | PASS | Same styled appearance in supplier/buyer views |

---

### TC-5.05 — @Mention "Type to search..." Empty State

| # | Check | Result | Notes |
|---|---|---|---|
| 5.05.1 | Type "@" with no additional characters | PASS | Shows "Type to search..." hint (fix #62) |
| 5.05.2 | Does NOT show "No results found" for empty query | PASS | Empty state is helpful hint, not misleading error |
| 5.05.3 | Type "@xyz" (no matches) | PASS | Shows "No results found" only for actual empty results |

---

### TC-5.06 — Supplier Inbox Visibility via @Mention

| # | Check | Result | Notes |
|---|---|---|---|
| 5.06.1 | Admin posts message with @mention of supplier | PASS | Message posted with supplier mention |
| 5.06.2 | Login as supplier@example.com | PASS | Supplier portal loads |
| 5.06.3 | Navigate to /en/supplier/inbox | PASS | Inbox page loads |
| 5.06.4 | Thread "Story 5 r7 - Cross-Portal Thread" visible | PASS | @mention added supplier as participant |
| 5.06.5 | Thread preview shows last message content | PASS | Stripped of HTML, mentions rendered as text |

---

### TC-5.07 — Supplier Posts Reply

| # | Check | Result | Notes |
|---|---|---|---|
| 5.07.1 | Open thread as supplier | PASS | Thread detail loads |
| 5.07.2 | Type reply message | PASS | Editor works in supplier portal |
| 5.07.3 | Submit reply | PASS | Toast: "Comment added" |
| 5.07.4 | Message appears with author "Test Supplier User" | PASS | Correct attribution |
| 5.07.5 | Timestamp shown | PASS | Relative time displayed |
| 5.07.6 | Copy/Edit/Delete/Reply on own message | PASS | All actions available for supplier's own message |
| 5.07.7 | Edit/Delete NOT available on admin's message | PASS | Only Copy and Reply shown for others' messages |

---

### TC-5.08 — Buyer Inbox Isolation

| # | Check | Result | Notes |
|---|---|---|---|
| 5.08.1 | Login as buyer@example.com | PASS | Buyer portal loads |
| 5.08.2 | Navigate to /en/buyer/inbox | PASS | Inbox page loads |
| 5.08.3 | Only buyer's own threads visible | PASS | No admin-supplier threads shown |
| 5.08.4 | No cross-portal thread leakage | PASS | r7 thread completely absent from buyer inbox |

---

### TC-5.09 — Distributor Thread Creation

| # | Check | Result | Notes |
|---|---|---|---|
| 5.09.1 | Login as distributor@example.com | PASS | Distributor portal loads |
| 5.09.2 | Navigate to /en/distributor/inbox | PASS | Inbox page loads |
| 5.09.3 | Click "+ New Thread" button | PASS | "Create New Thread" dialog opens |
| 5.09.4 | Title field (required) present | PASS | |
| 5.09.5 | Description field (optional) present | PASS | |
| 5.09.6 | Attachments section present | PASS | PDF/Images/Word, max 10MB each |
| 5.09.7 | Cancel and "Create Thread" buttons present | PASS | |

---

### TC-5.10 — Distributor Inbox Isolation

| # | Check | Result | Notes |
|---|---|---|---|
| 5.10.1 | Distributor inbox shows no admin/supplier/buyer threads | PASS | Complete isolation |
| 5.10.2 | Dashboard shows "No threads yet" in Recent Threads | PASS | Expected for fresh session |
| 5.10.3 | No cross-portal thread leakage to distributor | PASS | |

---

### TC-5.11 — Cross-Portal URL Access Control

| # | Check | Result | Notes |
|---|---|---|---|
| 5.11.1 | Supplier navigates to /en/admin/inbox | PASS | Redirected to /en/supplier |
| 5.11.2 | Buyer navigates to /en/distributor/inbox | PASS | Redirected to /en/buyer/catalog |
| 5.11.3 | Distributor navigates to /en/admin/inbox | PASS | Redirected to /en/distributor |
| 5.11.4 | Supplier accesses unauthorized thread URL | PASS | 404 "Page Not Found" |
| 5.11.5 | Buyer accesses unauthorized thread URL | PASS | 404 "Page Not Found" |
| 5.11.6 | Distributor accesses unauthorized thread URL | PASS | 404 "Page Not Found" |

---

### TC-5.12 — Internal Notes Feature REMOVED (fix #70)

| # | Check | Result | Notes |
|---|---|---|---|
| 5.12.1 | Admin thread editor: no "Internal" toggle button | N/A | Feature removed (fix #70) |
| 5.12.2 | Supplier thread editor: no "Internal" toggle | N/A | Feature removed |
| 5.12.3 | Buyer thread editor: no "Internal" toggle | N/A | Feature removed |
| 5.12.4 | Distributor thread editor: no "Internal" toggle | N/A | Feature removed |
| 5.12.5 | No amber-bordered internal note messages visible | N/A | Feature removed |
| 5.12.6 | No internal note content in thread previews | N/A | Feature removed |

> All previous TC-5.05/06/09/14/15/16 internal note tests are permanently N/A. The is_internal toggle has been removed from all editors. DB column retained but unused at application layer.

---

### TC-5.13 — Thread Participant Assignment

| # | Check | Result | Notes |
|---|---|---|---|
| 5.13.1 | Admin creates thread without @mention | PASS | Thread visible only to admin |
| 5.13.2 | Supplier does NOT see thread without @mention | PASS | Thread absent from supplier inbox |
| 5.13.3 | Admin @mentions supplier in thread | PASS | Mention posted |
| 5.13.4 | Supplier now sees thread in inbox | PASS | @mention adds participant |
| 5.13.5 | No UI hint explaining participant mechanism | WARN | No tooltip or onboarding hint on Create Thread dialog |

---

### TC-5.14 — Admin Pin Thread

| # | Check | Result | Notes |
|---|---|---|---|
| 5.14.1 | Click "Pin" button on thread | PASS | Toast: "Thread pinned" |
| 5.14.2 | Button changes to "Unpin" | PASS | Toggle state updated |
| 5.14.3 | Pin icon visible next to thread title | PASS | Visual indicator present |
| 5.14.4 | Reload page — pin state persists | PASS | "Unpin" still showing |
| 5.14.5 | Click "Unpin" — thread unpinned | PASS | Toast: "Thread unpinned"; icon removed |

---

### TC-5.15 — Admin Resolve/Reopen Thread

| # | Check | Result | Notes |
|---|---|---|---|
| 5.15.1 | Thread status initially "Open" | PASS | Open badge displayed |
| 5.15.2 | Click "Resolve" button | PASS | Toast: "Thread status updated" |
| 5.15.3 | Status badge changes to "Resolved" | PASS | Badge color updates |
| 5.15.4 | Button changes to "Reopen" | PASS | |
| 5.15.5 | Click "Reopen" | PASS | Status reverts to "Open" |
| 5.15.6 | Full cycle: Open > Resolved > Reopen > Open | PASS | All transitions work |

---

### TC-5.16 — Notifications

| # | Check | Result | Notes |
|---|---|---|---|
| 5.16.1 | Bell badge increments on new reply from other user | PASS | Badge count increases |
| 5.16.2 | Click bell opens notification panel | PASS | Dialog panel opens |
| 5.16.3 | Panel heading: "Notifications" | PASS | |
| 5.16.4 | "All" tab present | PASS | Shows all notifications |
| 5.16.5 | "Unread" tab present with count | PASS | Unread count in tab label |
| 5.16.6 | "Mark all read" button | PASS | Clears unread state |
| 5.16.7 | "View all in inbox" link | PASS | Navigates to inbox |
| 5.16.8 | Notification item shows message preview and timestamp | PASS | |

---

### TC-5.17 — Rich Text Formatting (fix #60)

| # | Check | Result | Notes |
|---|---|---|---|
| 5.17.1 | Editor toolbar visible | PASS | Full toolbar rendered |
| 5.17.2 | H2 button | PASS | Heading 2 formatting works |
| 5.17.3 | H3 button | PASS | Heading 3 formatting works |
| 5.17.4 | Bold button | PASS | Bold formatting works |
| 5.17.5 | Italic button | PASS | Italic formatting works |
| 5.17.6 | Underline button | PASS | |
| 5.17.7 | Strikethrough button | PASS | |
| 5.17.8 | Bullet List button | PASS | |
| 5.17.9 | Ordered List button | PASS | |
| 5.17.10 | Alignment buttons (Left/Center/Right) | PASS | |
| 5.17.11 | Link button | PASS | |
| 5.17.12 | Undo/Redo buttons | PASS | |
| 5.17.13 | DOMPurify sanitization active (fix #60) | PASS | script/iframe tags stripped on render |

---

### TC-5.18 — Emoji Rendering

| # | Check | Result | Notes |
|---|---|---|---|
| 5.18.1 | Post message with emojis | PASS | Emojis accepted in editor |
| 5.18.2 | Emojis persist in thread preview | PASS | Visible in inbox list |
| 5.18.3 | Emojis render correctly in thread detail | PASS | No encoding issues |

---

### TC-5.19 — Thread Routes (fix #71)

| # | Check | Result | Notes |
|---|---|---|---|
| 5.19.1 | Admin thread detail at /en/admin/inbox/{id} | PASS | Correct route (fix #71) |
| 5.19.2 | Supplier thread detail at /en/supplier/inbox/{id} | PASS | Correct route |
| 5.19.3 | Buyer thread detail at /en/buyer/inbox/{id} | PASS | Correct route |
| 5.19.4 | Distributor thread detail at /en/distributor/inbox/{id} | PASS | Correct route |
| 5.19.5 | Old /threads/{id} routes no longer exist | PASS | Directories deleted |
| 5.19.6 | Notification links use /inbox/{id} path | PASS | Updated in notification-dropdown.tsx |

---

### TC-5.20 — Login Failure Error Message

| # | Check | Result | Notes |
|---|---|---|---|
| 5.20.1 | Enter incorrect credentials | PASS | Credentials rejected |
| 5.20.2 | Error message "Invalid email or password" displayed | PASS | Inline error below password field |
| 5.20.3 | Page stays on /en/auth/login | PASS | No redirect on failure |

---

### TC-5.21 — File Attachments

| # | Check | Result | Notes |
|---|---|---|---|
| 5.21.1 | "Attach files" button present in editor | PASS | |
| 5.21.2 | File types accepted: PDF, Images, Word | PASS | File picker allows these types |
| 5.21.3 | Max file size: 10MB | PASS | Size limit enforced |
| 5.21.4 | Upload completes and file appears in thread | PASS | Attachment rendered with download link |

---

### TC-5.22 — Thread Status

| # | Check | Result | Notes |
|---|---|---|---|
| 5.22.1 | Thread created with "Open" status | PASS | Default status |
| 5.22.2 | Can transition to "Resolved" | PASS | Via Resolve button |
| 5.22.3 | Can reopen (Resolved > Open) | PASS | Via Reopen button |
| 5.22.4 | Status badge visually distinct per state | PASS | Different colors for Open/Resolved |

---

## Defects & Observations

### WARN-01 — No UI Hint for Thread Participant Assignment (TC-5.13.5)
- **Where:** "Create New Thread" dialog across all portals
- **Expected:** Tooltip or hint explaining that @mentioned users gain thread visibility
- **Actual:** No onboarding documentation; admin may not understand why newly created threads are invisible to suppliers
- **Impact:** Low. Functional behavior is correct, but discoverability is poor.
- **Action:** Add tooltip/hint to Create Thread dialog.

### WARN-02 — Buyer "Resolve" Button Present (unchanged)
- **Where:** Buyer thread detail view
- **Expected:** Only admin/support can resolve threads (product decision needed)
- **Actual:** Buyer can click "Resolve" to mark their own threads as resolved
- **Impact:** Low. May be intended. Product decision required.

---

## Results Matrix

| TC | Description | r3 | r7 |
|---|---|---|---|
| TC-5.01 | Admin creates thread | PASS | PASS |
| TC-5.02 | Admin posts regular message | PASS | PASS |
| TC-5.03 | @Mention autocomplete | PASS | PASS |
| TC-5.04 | @Mention rendering (span not link, fix #72) | -- | PASS |
| TC-5.05 | @Mention "Type to search..." empty state (fix #62) | -- | PASS |
| TC-5.06 | Supplier inbox visibility via @mention | PASS | PASS |
| TC-5.07 | Supplier posts reply | PASS | PASS |
| TC-5.08 | Buyer inbox isolation | PASS | PASS |
| TC-5.09 | Distributor thread creation | PASS | PASS |
| TC-5.10 | Distributor inbox isolation | PASS | PASS |
| TC-5.11 | Cross-portal URL access control | PASS | PASS |
| TC-5.12 | Internal notes feature REMOVED (fix #70) | N/A | N/A |
| TC-5.13 | Thread participant assignment | WARN | WARN |
| TC-5.14 | Admin pin thread | PASS | PASS |
| TC-5.15 | Admin resolve/reopen thread | PASS | PASS |
| TC-5.16 | Notifications | PASS | PASS |
| TC-5.17 | Rich text formatting (fix #60) | PASS | PASS |
| TC-5.18 | Emoji rendering | PASS | PASS |
| TC-5.19 | Thread routes /inbox/{id} (fix #71) | -- | PASS |
| TC-5.20 | Login failure error message | PASS | PASS |
| TC-5.21 | File attachments | PASS | PASS |
| TC-5.22 | Thread status (Open/Resolved/Locked) | PASS | PASS |

---

## Test Coverage Summary

| Section | Tests | Pass | Fail | Warn | N/A |
|---|---|---|---|---|---|
| Admin Creates Thread | 7 | 7 | 0 | 0 | 0 |
| Admin Posts Message | 10 | 10 | 0 | 0 | 0 |
| @Mention Autocomplete | 5 | 5 | 0 | 0 | 0 |
| @Mention Rendering | 3 | 3 | 0 | 0 | 0 |
| @Mention Empty State | 3 | 3 | 0 | 0 | 0 |
| Supplier Inbox Visibility | 5 | 5 | 0 | 0 | 0 |
| Supplier Posts Reply | 7 | 7 | 0 | 0 | 0 |
| Buyer Inbox Isolation | 4 | 4 | 0 | 0 | 0 |
| Distributor Thread Creation | 7 | 7 | 0 | 0 | 0 |
| Distributor Inbox Isolation | 3 | 3 | 0 | 0 | 0 |
| Cross-Portal URL Access | 6 | 6 | 0 | 0 | 0 |
| Internal Notes REMOVED | 6 | 0 | 0 | 0 | 6 |
| Thread Participant Assignment | 5 | 4 | 0 | 1 | 0 |
| Admin Pin Thread | 5 | 5 | 0 | 0 | 0 |
| Admin Resolve/Reopen | 6 | 6 | 0 | 0 | 0 |
| Notifications | 8 | 8 | 0 | 0 | 0 |
| Rich Text Formatting | 13 | 13 | 0 | 0 | 0 |
| Emoji Rendering | 3 | 3 | 0 | 0 | 0 |
| Thread Routes | 6 | 6 | 0 | 0 | 0 |
| Login Failure | 3 | 3 | 0 | 0 | 0 |
| File Attachments | 4 | 4 | 0 | 0 | 0 |
| Thread Status | 4 | 4 | 0 | 0 | 0 |
| **TOTAL** | **123** | **116** | **0** | **1** | **6** |

---

SUMMARY: Passed: 116 | Failed: 0 | Warnings: 1 | N/A (feature removed): 6
