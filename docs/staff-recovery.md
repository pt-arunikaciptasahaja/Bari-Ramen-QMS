# Staff recovery and copy improvements

The staff dashboard now supports recovering today's skipped tickets, reversing a mistaken table assignment, and cancelling an incorrect call. All recoveries return the existing ticket to **Menunggu**, retaining its ID, queue number, category, original registration order, contact details and private ticket URL. They do not issue another number or automatically call the guest again.

## Staff workflow

- For an active call, choose **Batalkan panggilan**.
- For **Meja diberikan** or **Dilewati**, open the history section and choose **Kembalikan ke antrean**.
- Select an explanation: **Pelanggan datang terlambat** (skipped tickets only), **Salah klik oleh staf**, or **Penyesuaian operasional**. An optional note is limited to 200 characters.
- Confirm **Kembalikan ke antrean**. The ticket reappears in the active list with **Diedit · 1×**, **Diedit · 2×**, etc. Select the badge to view the reason, note, time, previous status and responsible staff ID.
- Call again when a suitable table is available. The next call starts a fresh 0/5/10/15-minute cycle; WhatsApp remains unavailable until the new third call. A restored late arrival retains the original registration order, which the confirmation dialog states explicitly.

Only current-day tickets can be recovered. Older tickets remain readable in history and must use a new registration for a new service date. A self-registering customer with another active ticket cannot have an old ticket restored into a second active place. Manual staff registration continues to support multiple parties.

## Data and concurrency

Migration `20261022030858_staff_queue_recovery` adds `edit_count` and `last_edited_at` to the private queue table, `cancelled_at` to push jobs, and the RLS-protected private `queue_edits` audit table. No existing queue statuses, numbers or contacts are backfilled or changed.

`restore_queue` requires an authenticated staff allowlist entry, a valid reason, a request UUID and the expected status/edit count. Locks serialize retries, registration ownership, recovery and push acknowledgement. Retrying the same successful request is idempotent; a stale status/edit revision or reused UUID with changed input is rejected. This also prevents a stale browser from undoing a later staff action.

The audit records each recovery's actor ID, time, reason, optional note, previous status and call snapshot. Browser roles have no direct audit-table access or write privilege. `queue_edit_history` checks staff authorization before returning records. Audit notes and staff identities are not included in the public board or customer-ticket RPC. CSV exports include the recovery count and last edit timestamp, and continue to escape formula-like values.

Recovery cancels pending/leased old-cycle jobs and invalidates their lease tokens. A late worker acknowledgement cannot overwrite restored ticket state. Subscriptions remain registered for the same private ticket. Notifications already accepted by a push provider and manually sent WhatsApp messages cannot be recalled; the confirmation dialog explains that already received messages can remain visible.

The offline demo uses local fake data and preserves an audit trail with the ticket in one localStorage write. It does not run the server scheduler.

## Copywriting

The customer form clarifies the representative name and party size including the person registering. Customer ticket states share text with the legacy `/q/[id]` route; both show the current call count, identify the first-call time and explain the 15-minute rule. Device notification guides remain available, with optional Android help collapsed initially.

Staff actions now use **Berikan meja**, **Lewati antrean** and **Lewati QR**, separating queue status changes from ticket handoff. Registration sources are **Daftar mandiri** and **Didaftarkan staf**. TV instructions use short customer-facing phrases instead of minute-zero terminology. Provider acceptance is described as notification processing, not proof of delivery.

## Validation and release

83 automated tests passed, including guest/public access denial, current-day limits, lost-response retries, stale revisions, cancelled jobs, new call cycles, mistaken seating, late arrivals, guest active-ticket uniqueness and audit privacy. TypeScript and optimized production build passed. The history CSV regression also verifies edit metadata.

The live migration was applied after inspecting migration history. Read-only verification found no edited tickets/audit rows, unchanged status totals (3 waiting, 0 called, 29 seated, 9 no-show), and scheduler activation still disabled. No live ticket was used for recovery testing. Supabase advisors flag the intentional authenticated SECURITY DEFINER wrappers; both check `auth.uid()` and `is_staff()`, and raw private-table access remains denied. Earlier extension/password-protection notices are documented in `notification-release.md`.

Deployment remains through the existing draft PR to `main`. Browser checks use a preview with local fake data; production release and automatic scheduling activation retain the existing release gates, including real mobile push acceptance.
