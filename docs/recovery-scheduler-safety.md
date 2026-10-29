# Linked recovery and scheduler safety fix

Prepared 29 October 2026 against Production source `f9be095`. This is a source
fix and reviewable migration candidate; it has not been applied to Production.

## Resulting behavior

- A party retains private membership across all newly recorded visits, including
  visits created by different Safari/Home Screen/Chrome anonymous sessions.
- Restore rejects any older member if the party already has another active
  ticket for the current Jakarta service date, regardless of its owner session.
- With no active linked ticket, restoring a known member retains the original
  ticket ID/number/order, records the existing Diedit marker/audit, cancels old
  push work, resets the call cycle, and points the private bridge to that ticket.
- Registration reuses a restored active member. Replaying a successful restore
  request cannot move the bridge backwards after a subsequent visit starts.
- The legacy customer registration API remains available with its original
  response shape, but now records private membership too. Its old implementation
  is moved to a private helper with direct execution revoked for guest roles.
- Scheduler candidates exclude already-correct reminder counts before applying
  the 200-row limit. More than 200 due calls drain across ticks, with unchanged
  0/3/6/10 timing and the preserved old-cycle policy. No double calls/push jobs.

## Identity and concurrency

`customer_visit_links.party_id` is an immutable private identity; the new
RLS-protected `customer_visit_members` table retains every newly recorded visit.
Neither is added to the public board or customer-ticket response. Direct private
table/helper access remains denied to anon/authenticated. No names or phone
numbers are used to infer identity.

Customer registration, bridge linking and recovery acquire one short
PostgreSQL transaction advisory lock before existing owner/bridge/row locks.
This prevents cross-owner lock inversions and serializes identity-changing
operations for this small restaurant workload. Reads, calls, seating, scheduler
and push dispatch do not acquire that lock; no HTTP request runs inside it.
This favors correctness at the intended 50–100 daily parties. A future high-rate
registration service should measure contention and consider finer party locks.

Private token scope and the resolver are unchanged. Expired bridge tokens stay
expired; rotating from the current active ticket retains history without
reviving the previous seed URL.

## Historical rollout safety

Migration `20261029042320_queue_recovery_and_scheduler_safety.sql` adds private
metadata and changes functions. It does not rewrite queue statuses, numbering,
customer details or scheduler configuration/enabled state.

Existing bridge seed/current endpoints are the only relationships backfilled.
The old schema did not retain intermediate membership, so those relationships
cannot be reconstructed safely. The migration aborts atomically if a ticket
appears in contradictory existing bridges. It never guesses a match.

An older online ticket with no provable membership fails closed on recovery with
an explanation requesting operator verification. Staff/manual unlinked entries
retain normal recovery. Newly registered online tickets always record membership,
including clients using the older registration RPC. This limitation on ambiguous
historical online tickets is deliberate and must be briefed before release.

## Validation / release

Validation completed: 137 automated tests, TypeScript and a fresh Production build pass.

The original cross-device restore diagnostic and 550-due-party scale diagnostic
now pass in isolated PGlite. New standard regressions cover original/intermediate
members across three sessions, valid recovery, retry-after-new-visit behavior,
expired bridge rotation, private privileges, exact-state preservation on upgrade,
ambiguous-backfill rollback and full 550-row reminder/no-show drainage.

PGlite is one serialized connection: queued Promise.all retries do not certify
independent hosted-Postgres contention. The standard npm test command now runs
files sequentially to keep isolated database memory bounded.

Before any Production application:

1. Review this exact migration/commit and run npm test, typecheck and build.
2. Inspect live migration history; do not replay earlier migrations or repair
   historical timestamps blindly. This new migration follows link_customer_visits.
3. Read-only check seed/current bridge membership for conflicting identities and
   multiple active members. Resolve any conflicts through an approved staff flow,
   never bulk-reset live queue records to make a migration pass.
4. Apply only this migration within an explicitly authorized release window.
   No scheduler activation or configuration change is needed.
5. Check RLS/helper privileges and complete a safe isolated or approved pre-opening
   staff/browser acceptance test. No fake guests in an active Production queue.

Do not downgrade to the old restore function after new membership is recorded.
A rollback needs review of function compatibility; retain additive identity data.
The remaining launch gates (commercial hosting, Wi-Fi signup limits, backups and
physical-device notification/TV checks) are separate from these two bug fixes.
