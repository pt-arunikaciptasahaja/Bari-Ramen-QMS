begin;
-- Operational recovery snapshots for explicitly requested test-day resets.
-- No browser or staff API can read ticket capabilities / push credentials here.
create table qms_private.queue_reset_archives (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default clock_timestamp(),
  service_date date not null,
  reason text not null,
  snapshot jsonb not null
);
alter table qms_private.queue_reset_archives enable row level security;
revoke all on qms_private.queue_reset_archives from public,anon,authenticated;
commit;
