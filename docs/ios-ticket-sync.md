# Safari and iOS Home Screen ticket continuity

Safari and an installed iOS web app have separate cookies, Supabase anonymous
sessions and localStorage. A website cannot silently discover the other store.
Do not use a name, phone number, queue number, IP address or fingerprint to infer
that two sessions belong to the same customer.

## Customer flow

1. Register in either context. The application creates one private visit bridge.
2. On the ticket, choose **Salin tautan tiket**.
3. In the other context, open registration, expand **Sudah daftar di Safari atau
   browser lain?**, paste the complete link and choose **Hubungkan tiket saya**.
4. Both contexts now resolve the same server-side current ticket on reopening,
   focus, returning online and every 15 seconds while open. Repeated registration
   against the same bridge returns the existing active ticket.
5. Once seated or no-show, registration is available again. A new submission gets
   the next number; the bridge updates atomically for both linked contexts.
6. Connections expire 30 days after creation, without sliding renewal. Reconnect
   using the current active ticket link when required. Keep private links private.

Installing from the ticket still preserves its fragment URL. An app installed
before browser registration needs the explicit transfer above. No automatic
cross-store discovery is claimed. Notification permission and subscription belong
to each context: open the Home Screen app and enable/test notifications there.

## Security / rollout

Migration `link_customer_visits` is additive: one RLS-protected private table and
three narrowly scoped RPCs. No queue entries, counters, scheduler policy, POS or
staff registration paths are changed by the migration. Read/link requires a
256-bit private ticket capability; registration additionally requires an anonymous
Auth session. Table access is denied to anon/authenticated roles. Owner and bridge
transaction locks serialize linked submissions. Bridge tokens stay in URL
fragments, never query strings. Current-ticket push links retain the canonical
bridge instead of creating a second independent visit history.

Apply the reviewed migration before deploying the new registration client. The
old registration RPC stays intact for old clients. Already-open old versions need
reopening to use linked registration; they cannot be made to share iOS storage.

## Validation

`tests/customer-sync.test.ts` runs the migrations in isolated PostgreSQL (PGlite)
and models independent Safari/Home Screen stores and different anonymous users:

- Browser-first with an app installed earlier: no silent shared state.
- Explicit transfer resolves the exact ticket without creating a new entry.
- Registration with a second Auth user reuses the active linked ticket.
- Read capability works without shared Auth cookies; raw tables stay private.
- No-show followed by a same-day return creates C-002; both stores resolve it.
- Old pinned URL and current-ticket push URL retain the shared bridge.
- Repeated submissions preserve numbering and one active linked visit.
- Seating followed by an app-first return creates C-003, visible in Safari.
- Finished request replay cannot move the bridge backwards.
- Invalid, foreign-origin and expired links fail safely.
- Previous-day ticket does not count as an active visit today.

Browser QA also covers the transfer disclosure, link validation and registration
UI. Cloud Chrome is not a physical iOS Safari/standalone runtime; installation,
iOS clipboard behavior and Web Push delivery still need a physical-device check.
