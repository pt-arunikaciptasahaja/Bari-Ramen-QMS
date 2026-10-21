# Bari Ramen QMS

Queue management for guests at Bari Ramen. Guests scan a registration QR and enter their own details, or staff create walk-in tickets for them. The TV displays calls and waiting numbers. IGNATIA remains a separate POS.

## Summary

Customer self-registration, manual walk-in registration, private customer contact details, staff actions, and a live public display.

## Install

Use Node.js 22 or later and install the locked dependencies.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key. The existing variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` accepts a modern publishable key. Never expose a service-role or secret key.

Without both Supabase variables, local demo data is shared only between tabs in the same browser.

## Database and access

For a new database, apply all files in `supabase/migrations` in filename order. Existing deployments apply only migrations not already recorded/applied. The customer self-registration migration adds a separate `register_customer` RPC; the existing staff-only `enqueue` RPC remains unchanged. Some earlier deployments recorded equivalent migrations under different timestamps: reconcile their history by migration name/content before using an automatic migration push. Do not replay older migrations on production.

Enable **Anonymous Sign-Ins** in Supabase Auth for customer self-registration. The app creates a guest session on submission; guests do not enter an email/password or receive staff privileges. Review anonymous sign-in rate limits for the restaurant network (many customers may share one public IP). Consider Supabase CAPTCHA protection for a broadly public deployment; CAPTCHA requires corresponding client integration and is not bundled here.

Create a confirmed staff account in Supabase Auth, then add its user ID to `public.staff_members`. The application does not use user-editable metadata to authorize staff.

Phone numbers are optional, normalized to international format, stored only in the private ticket table, and available to staff in the dashboard and CSV exports. The public board contains no names or phone numbers. Adding a phone number does not send a WhatsApp message or push notification.

## Usage

| Route | Purpose |
| --- | --- |
| `/` | Guest information, self-registration link, and saved ticket access. |
| `/register` | Customer form: name, party size (1–12), and optional phone. Opens the private ticket directly after registration. |
| `/register/qr` | Public registration QR poster, with a print button. Display or print this at the entrance/cashier. |
| `/staff` | Staff login, walk-in registration, phone field, calls, completion, skipped tickets and daily history. |
| `/pickup#screen=…` | Customer-facing QR pickup display, paired by a staff-generated 12-hour link. No staff login on this device. |
| `/ticket#t=…` | Private, read-only customer ticket, opened after self-registration or by scanning the pickup display. |
| `/tv` | Public display with no QR code. |
| `/q/[id]` | Legacy private tracker, accessible only to the original owning session or staff. No public sharing by phone or ticket UUID alone. |

Queue groups are A (1-2 people), B (3-5), and C (6-12). Numbering follows the Jakarta service date. Staff choose a suitable party for available seating. Completing a ticket means a table was given, not that a transaction was paid or the guest finished dining.

### Customer self-registration

1. On `/staff`, find **Scan untuk daftar antrean** and choose **Buka / cetak QR**. Display the QR at the restaurant or print it from `/register/qr`. The QR opens `/register` on the current website; use the deployed website when printing for customers.
2. A guest scans it and enters one name and party size for their group, plus an optional phone number. **Ambil nomor antrean** creates a ticket and opens `/ticket#t=…` directly, without a second scan.
3. Self-registered tickets use source `online` (also used by historical online tickets) and share the same daily A/B/C counters, staff dashboard, TV, history, and optional Web Push flow as manual tickets.
4. Repeat requests and other tabs in the same guest session reuse the active self-registered ticket. A saved active ticket from staff registration is also reopened by the customer page. This is browser/session-based duplicate prevention, not identity or phone verification; different devices or cleared browser data create different sessions.
5. Guests needing assistance can still be registered through the unchanged staff form. Staff-issued tickets retain their separate pickup QR flow. Self-registered tickets never enter that pickup queue or flash its scan acknowledgement.

Registration reserves a place in today's queue, not a table at a scheduled time. The static QR/link can be shared and does not prove physical presence. Customer self-registration and private ticket links require Supabase; local demo mode continues to support manual staff queues and displays a clear error if the customer form is submitted.

### Customer ticket pickup

1. On `/staff`, select **Siapkan layar pelanggan** and copy the generated display link to a customer-facing phone/tablet. The link is scoped to QR pickup only and expires in 12 hours. Treat it as a private device link.
2. Register walk-in guests normally. Each ticket automatically gets a private random QR capability stored outside the exposed schema. The pickup screen displays the oldest unclaimed active ticket, without a name or phone.
3. The guest scans the QR. `/ticket` opens without an account, marks only the first opening, and shows their ticket, exact party size, within-group queue position, and live status. After a four-second acknowledgement, the display moves to the next ticket. Reloading the guest page never changes their queue status or resets the opening time.
4. Guests without phones remain in the table queue. Staff select **Lewati scan** to let the next QR appear, without skipping the table queue. **QR tiket** can reopen or copy a specific ticket link.
5. The customer link is retained locally for **Buka tiket saya** on the home page and expires at the Jakarta service-day boundary. Anyone holding the link can view that ticket only; it never exposes names/phones or permits seating/cancellation. No account verification is implied.

The display polls every two seconds and hides the QR on connection errors. The tracker reconciles private details every 15 seconds and uses the anonymous public board for live status. Web Push is available after explicit opt-in; automatic WhatsApp is not included.

### Web Push notifications

The ticket page has an explicit **Aktifkan notifikasi** button. Permission is requested only after a tap, never on page load. iOS/iPadOS 16.4+ requires adding the ticket to the Home Screen and opening it there. The manifest omits `start_url` so installation uses the current ticket document URL and fragment. Verify this on target iPhones, since installation behavior and storage isolation vary by OS version.

Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and server-only `VAPID_PRIVATE_KEY` in the deployment environment before building. Generate keys locally with a trusted Web Push library. Never commit private keys, subscriptions, or ticket tokens. No Supabase service-role key is required.

Subscriptions are stored in `qms_private`, scoped to a private ticket capability, limited to three devices, and expire at the next Jakarta midnight. Only supported HTTPS push-service endpoints and valid keys are accepted. Expired subscriptions are cleaned during registration. Guests can disable notifications for their ticket. **Uji notifikasi** sends through the real push transport with a 30-second server-side cooldown.

When staff select **Panggil**, the authenticated `/api/queue/call` route changes status and the database trigger writes an outbox entry per subscribed device. Next.js `after()` dispatches encrypted Web Push after returning to staff, so slow push services do not block the cashier. Claim leases, per-call uniqueness, and a three-attempt cap prevent normal duplicate dispatch. Supabase Cron checks the database every 10 seconds independently of staff/TV browsers. It advances calls and dispatches pending pushes through the signed `/api/queue/worker` route. Short-lived HMAC signatures and one-use database receipts keep permanent secrets out of the pg_net request queue. A 60-second lease, unique device/call key, fenced acknowledgements, and a maximum of three attempts prevent concurrent duplicate dispatch. Staff can retry after the lease expires.

`accepted` means accepted by the push service, not delivered, read, or heard. A network timeout can produce an uncertain outcome, so delivery is not exactly-once. Notifications use a per-ticket/per-call tag/topic and a 60-second TTL. Calls are committed at minute 0, then reminders become due at minutes 5 and 10. The TV rings when the server publishes a new call count. At minute 15 unresolved tickets become no-show. Normal scheduling latency is up to 10 seconds, plus database/network delay. After an outage only the current reminder is sent; expired tickets skip directly to no-show without a burst of old calls. Do not promise sound or exact timing: network access, browser permissions, Force Stop, Focus/Do Not Disturb, and device power management affect delivery. The service worker does not cache private pages or staff sessions.

### WhatsApp follow-up

A gray **Buka WhatsApp** button appears beside the private customer phone number. It unlocks after the server confirms `call_count=3` and ten minutes have elapsed since the first `called_at`, while the ticket remains called on the current Jakarta service date. The button stays available until seating or no-show. Missing/invalid phones, waiting tickets, and resolved tickets cannot open a contact link.

After staff confirm the customer consent and message preview, click-to-chat opens a prefilled message using the WhatsApp account signed in on the staff device. Staff must press Send in WhatsApp. The QMS does not claim sent/delivered status or send through an API. Use the official restaurant account **+62 852-1996-9592**. Click-to-chat targets the customer; the sender is whichever WhatsApp account is signed in on the staff device. A web link cannot force WhatsApp to switch sender accounts.

Group boundaries apply to newly issued tickets. Existing ticket numbers and stored groups are never reassigned. Exact party size remains visible for legacy tickets.

### TV display

- Keep the TV browser open and device awake. Click **Aktifkan suara** once and check volume.
- A new call rings immediately. Server-confirmed reminders ring at minutes 5 and 10 from the first `called_at`.
- Timer badges become amber after five minutes and red after ten minutes. Group colors stay fixed: sky for A, teal for B, violet for C. Reminders stop when staff select Selesai/Lewati or the server marks no-show after fifteen minutes.
- Waiting tickets rotate every 15 seconds. Each page holds up to ten rows, reduced automatically when the display has less vertical space. No waiting ticket is permanently hidden by a fixed slice.
- Earlier unresolved calls remain visible and rotate four per page when needed.
- Browser suspension, sleep, muted audio, and lost connectivity can delay notifications. The TV only presents committed server events; closing it does not stop scheduling or customer Web Push.

### History and recap

Choose a registration date in Asia/Jakarta, filter completed/skipped tickets, and search by name or number. CSV export includes every matching row across pages. Daily summary metrics use the entire selected registration date, independently of the history status/search filter.

Metrics include registrations, parties and people seated, skipped parties, source, and average registration-to-call time for tickets with valid call timestamps. These are not revenue, bowls sold, dining duration, or table occupancy metrics. Historical QR tickets are retained as legacy data.

## Validation

```bash
npm test
npm run typecheck
npm run build
```

Tests cover authorization, atomic numbering, registration/pickup privacy, call isolation, private phone data, analytics, CSV safety, display pagination, reminder boundaries, outage recovery, worker authentication and lease fencing. See `docs/notification-release.md` for the migration audit, deployment order, activation, rollback and device acceptance checks.

## Contribute

Keep staff flows concise, use Indonesian labels, preserve public/private data boundaries, and run validation before deploying. Schema changes must include a migration and regression coverage.

## License

Private client project. No open-source license has been granted.
