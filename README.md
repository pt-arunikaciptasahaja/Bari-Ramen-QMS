# Bari Ramen QMS

Queue management for guests registering in person at Bari Ramen. Staff create walk-in tickets; the TV displays calls and waiting numbers. IGNATIA remains a separate POS.

## Summary

Walk-in queues, private customer contact details, staff actions, and a live public display.

## Install

Use Node.js 22 or later and install the locked dependencies.

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and set the Supabase project URL and publishable key. The existing variable `NEXT_PUBLIC_SUPABASE_ANON_KEY` accepts a modern publishable key. Never expose a service-role or secret key.

Without both Supabase variables, local demo data is shared only between tabs in the same browser.

## Database and access

For a new database, apply all files in `supabase/migrations` in filename order. Existing deployments apply only migrations not already recorded/applied. The latest migration preserves historical online tickets and blocks all new registrations except staff-created walk-ins.

Create a confirmed staff account in Supabase Auth, then add its user ID to `public.staff_members`. The application does not use user-editable metadata to authorize staff.

Phone numbers are optional, normalized to international format, stored only in the private ticket table, and available to staff in the dashboard and CSV exports. The public board contains no names or phone numbers. Adding a phone number does not send a WhatsApp message or push notification.

## Usage

| Route | Purpose |
| --- | --- |
| `/` | Information directing guests to register with staff in the restaurant. No self-service form. |
| `/staff` | Staff login, walk-in registration, phone field, calls, completion, skipped tickets and daily history. |
| `/tv` | Public display with no QR code. |
| `/q/[id]` | Legacy private tracker, accessible only to the original owning session or staff. No public sharing by phone or ticket UUID alone. |

Queue groups are A (1-2 people), B (3-5), and C (6-12). Numbering follows the Jakarta service date. Staff choose a suitable party for available seating. Completing a ticket means a table was given, not that a transaction was paid or the guest finished dining.

### WhatsApp follow-up

A gray **Buka WhatsApp** button appears beside the private customer phone number. It unlocks three minutes after `called_at` while the ticket remains called on the current Jakarta service date. This is elapsed time, not proof that TV bells were heard. Missing/invalid phones, waiting tickets, and resolved tickets cannot open a contact link.

After staff confirm the customer consent and message preview, click-to-chat opens a prefilled message using the WhatsApp account signed in on the staff device. Staff must press Send in WhatsApp. The QMS does not claim sent/delivered status or send through an API. Use the restaurant account. No Web Push is included.

Group boundaries apply to newly issued tickets. Existing ticket numbers and stored groups are never reassigned. Exact party size remains visible for legacy tickets.

### TV display

- Keep the TV browser open and device awake. Click **Aktifkan suara** once and check volume.
- A new call rings immediately. Unresolved calls trigger a reminder every minute, measured from `called_at`.
- Timer badges become amber after one minute and red after three minutes. Group colors stay fixed: sky for A, teal for B, violet for C. Reminders stop when staff select Selesai or Lewati.
- Waiting tickets rotate every 15 seconds. Each page holds up to ten rows, reduced automatically when the display has less vertical space. No waiting ticket is permanently hidden by a fixed slice.
- Earlier unresolved calls remain visible and rotate four per page when needed.
- Browser suspension, sleep, muted audio, and lost connectivity can delay notifications. Reminder timers run on the open TV page, not in a background push service.

### History and recap

Choose a registration date in Asia/Jakarta, filter completed/skipped tickets, and search by name or number. CSV export includes every matching row across pages. Daily summary metrics use the entire selected registration date, independently of the history status/search filter.

Metrics include registrations, parties and people seated, skipped parties, source, and average registration-to-call time for tickets with valid call timestamps. These are not revenue, bowls sold, dining duration, or table occupancy metrics. Historical QR tickets are retained as legacy data.

## Validation

```bash
npm test
npm run typecheck
npm run build
```

Tests cover authorization, atomic numbering, call isolation, private phone data, blocked online registration, analytics, CSV safety, display pagination, and reminder timing.

## Contribute

Keep staff flows concise, use Indonesian labels, preserve public/private data boundaries, and run validation before deploying. Schema changes must include a migration and regression coverage.

## License

Private client project. No open-source license has been granted.
