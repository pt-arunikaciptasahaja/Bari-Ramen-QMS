# Call policy (27 October 2026)

For new call cycles: call 1 at minute 0, call 2 at minute 3, call 3 at minute 6, and automatic no-show at minute 10 if the ticket is still called. Timing is relative to the first call, never registration. Supabase Cron checks every 10 seconds, so transitions occur on the next tick. Seating or skipping stops the cycle.

WhatsApp unlocks 180 seconds after the first call while the ticket remains called, has a valid phone number, and belongs to today's service date. It opens a prepared message; staff still send it through the restaurant WhatsApp account. No automatic WhatsApp messages are sent.

The migration adds a private policy activation timestamp. Calls already underway retain 0/5/10/15 timing to avoid shortening a customer's existing deadline. Restored tickets start the new policy when called again. Queue rows and customer data are not rewritten by the migration. Existing token checks, grants, locking, idempotent push jobs, and signed scheduler transport are preserved.

Validation: isolated PostgreSQL tests cover 3/6/10 boundaries, duplicate ticks, seating protection, old-cycle preservation, push expiry and recovery. WhatsApp tests cover the exact 180-second boundary, phone validation, terminal/expired tickets, and message encoding.
