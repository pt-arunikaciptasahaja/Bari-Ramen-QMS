# Customer notification follow-up — 29 October 2026

Read-only production diagnosis found subscriptions created after the initial call (and one after the second call), so no job existed for the already-current call. Other recent Apple/Google requests returned provider acceptance (201); acceptance is not evidence that an operating system displayed a notification. Some called tickets had no subscription at all.

## Changes

- Prepare an active service worker before enabling the activation button. Invoke `PushManager.subscribe()` directly from the tap, without awaiting registration, permission, or a subscription lookup first. This preserves Safari user activation.
- On opening a ticket, resuming, or reconnecting, reconnect an existing granted browser subscription to the actual current ticket. Do not prompt or create subscriptions in the background. Explicit notification opt-out is saved locally and respected across visits.
- `20261029092226_late_notification_subscription.sql` replaces only `save_push_subscription`. Its existing ticket capability validation, device limit, endpoint allowlist, grants and expiry remain intact. It locks the ticket row to serialize against calling/seating, then inserts at most one job for the latest still-valid call. Earlier reminders are not replayed; existing accepted jobs are not resent. The server scheduler dispatches the new job on its next tick.
- The migration has no backfill and does not change queue numbers, statuses, counters, or existing subscriptions when applied. It is independent of the earlier pending recovery/scheduler migration.
- TV waiting-list heading displays `Page N of M`, including one-page and empty states. Slideshow counters remain hidden.

## Validation / limits

Regression tests cover direct tap timing, return-visit reconnection, opt-out/denial/no-consent, missing browser subscriptions, transient network failure, late opt-in, accepted-job deduplication, reassignment to a new visit, terminal tickets, and expired call windows. The existing scheduler, private ticket access and recovery tests remain required.

Physical Android Chrome and iOS Home Screen tests are still needed: register via QR, enable notifications **before** staff call, test with screen locked, confirm calls at 0/3/6 minutes, finish visit, register again and confirm reconnection. Also enable after a call and confirm one current-call notification. iOS browser tabs do not support the same push flow as installed Home Screen apps. Focus, notification permission, network and battery settings can affect delivery; provider acceptance must never be described as proof of display.
