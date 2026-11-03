# Explicitly requested queue reset

The private `queue_reset_archives` table stores operator recovery snapshots before an authorized test-day reset. RLS is enabled with no client policies; public, anon and authenticated have no table privileges. Snapshots can contain private customer details and ticket/push capabilities: never expose/export them to the public app, logs, or Git.

A reset must be scoped to one confirmed Jakarta service date. Inspect all statuses and counters first: deleting only waiting entries cannot restart at 001 if seated/no-show entries still reserve numbers under the day's unique constraints. Preserve other service dates and staff/Auth/settings/pickup pairings.

Within one short transaction, acquire NOWAIT locks on the counters, entries and affected dependent tables, verify the inspected ticket-set fingerprint has not changed, and reject called tickets or recently sending push jobs. Insert a snapshot of the scoped queue entries, board rows, counters, ticket access, visit links, edits, subscriptions and cascading push jobs. Only then delete the scoped edits and queue entries, followed by that day's counters. Queue-board trigger/FK cascades clean up dependent live rows. Any failure rolls back the snapshot and reset together. Verify zero scoped rows/counters, no change to other days, and archive row counts before commit.

Do not bulk restore an archive over new test traffic. Restore requires reviewing counter/number collisions, linked-ticket continuity and notification replay first. This is an operational recovery snapshot, not an offsite database backup.
