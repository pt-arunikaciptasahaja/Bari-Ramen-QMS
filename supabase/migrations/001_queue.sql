-- Run ONCE in a new Supabase project's SQL editor (or via Supabase migrations).
-- No service-role key is needed by the application.
begin;

create table public.staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.staff_members enable row level security;
revoke all on public.staff_members from anon, authenticated;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.staff_members where user_id = auth.uid());
$$;
revoke all on function public.is_staff() from public;
grant execute on function public.is_staff() to authenticated;

create table public.queue_counters (
  service_date date not null,
  group_code text not null check (group_code in ('A','B','C')),
  last_number integer not null check (last_number > 0),
  primary key (service_date, group_code)
);
alter table public.queue_counters enable row level security;
revoke all on public.queue_counters from anon, authenticated;

create table public.queue_entries (
  id uuid primary key default gen_random_uuid(),
  queue_number text not null,
  customer_name text not null check (char_length(btrim(customer_name)) between 1 and 60),
  pax integer not null check (pax between 1 and 12),
  source text not null check (source in ('walk-in','online')),
  status text not null default 'waiting' check (status in ('waiting','called','seated','no-show')),
  created_at timestamptz not null default clock_timestamp(),
  called_at timestamptz,
  -- Supporting columns make daily numbering, ownership and retries safe.
  owner_id uuid not null references auth.users(id),
  service_date date not null default (now() at time zone 'Asia/Jakarta')::date,
  group_code text not null check (group_code in ('A','B','C')),
  ticket_sequence integer not null check (ticket_sequence > 0),
  request_id uuid not null unique,
  unique (service_date, group_code, ticket_sequence),
  unique (service_date, queue_number)
);
create index queue_entries_active on public.queue_entries(service_date, status, created_at);
create index queue_entries_owner on public.queue_entries(owner_id, service_date);
alter table public.queue_entries enable row level security;
revoke all on public.queue_entries from anon, authenticated;
grant select on public.queue_entries to authenticated;
create policy "Owner or staff can read tickets" on public.queue_entries
  for select to authenticated using (owner_id = auth.uid() or public.is_staff());

-- Public projection for TV and position tracking. Never includes customer names,
-- owner IDs or retry tokens. A view alone cannot emit Postgres Changes events.
create table public.queue_board (
  id uuid primary key,
  queue_number text not null,
  pax integer not null,
  source text not null,
  status text not null,
  created_at timestamptz not null,
  called_at timestamptz,
  service_date date not null,
  group_code text not null,
  ticket_sequence integer not null
);
create index queue_board_day on public.queue_board(service_date, created_at);
alter table public.queue_board enable row level security;
revoke all on public.queue_board from anon, authenticated;
grant select on public.queue_board to anon, authenticated;
create policy "Public can read today's anonymous board" on public.queue_board
  for select to anon, authenticated
  using (service_date = (now() at time zone 'Asia/Jakarta')::date);

create function public.sync_queue_board() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'DELETE' then
    delete from public.queue_board where id = OLD.id;
    return OLD;
  end if;
  insert into public.queue_board(id, queue_number, pax, source, status, created_at, called_at, service_date, group_code, ticket_sequence)
    values(NEW.id, NEW.queue_number, NEW.pax, NEW.source, NEW.status, NEW.created_at, NEW.called_at, NEW.service_date, NEW.group_code, NEW.ticket_sequence)
  on conflict(id) do update set status = excluded.status, called_at = excluded.called_at;
  return NEW;
end;
$$;
revoke all on function public.sync_queue_board() from public;
create trigger queue_board_sync after insert or update or delete on public.queue_entries
  for each row execute function public.sync_queue_board();

create function public.enqueue(p_name text, p_pax integer, p_source text, p_request_id uuid)
returns public.queue_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_staff boolean := public.is_staff();
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_group text;
  v_number integer;
  v_entry public.queue_entries;
begin
  if v_owner is null then raise exception 'Sesi tamu diperlukan.'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'Nama Tamu wajib diisi, maksimal 60 karakter.';
  end if;
  if p_pax is null or p_pax not between 1 and 12 then raise exception 'Jumlah Orang harus 1 sampai 12.'; end if;
  if p_source is null or p_source not in ('walk-in','online') then raise exception 'Asal antrean tidak valid.'; end if;
  if p_source = 'walk-in' and not v_staff then raise exception 'Hanya staf yang dapat menambahkan walk-in.'; end if;
  if p_request_id is null then raise exception 'Identitas permintaan diperlukan.'; end if;

  -- Serialize same-browser registrations, including concurrent tabs and retries.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_entry from public.queue_entries where request_id = p_request_id;
  if found then
    if v_entry.owner_id <> v_owner then raise exception 'Identitas permintaan tidak valid.'; end if;
    return v_entry;
  end if;
  -- Guests can hold one active ticket per Jakarta day. Staff can add many parties.
  if not v_staff then
    select * into v_entry from public.queue_entries
      where owner_id = v_owner and service_date = v_date and status in ('waiting','called')
      order by created_at limit 1;
    if found then return v_entry; end if;
    if (select count(*) from public.queue_entries where owner_id = v_owner and service_date = v_date) >= 3 then
      raise exception 'Batas pendaftaran hari ini tercapai. Hubungi staf.';
    end if;
  end if;

  v_group := case when p_pax <= 2 then 'A' when p_pax <= 4 then 'B' else 'C' end;
  -- Atomic UPSERT uses PostgreSQL row locks, never count(*) + 1.
  insert into public.queue_counters(service_date, group_code, last_number) values(v_date, v_group, 1)
    on conflict(service_date, group_code) do update
      set last_number = public.queue_counters.last_number + 1
    returning last_number into v_number;
  insert into public.queue_entries(queue_number, customer_name, pax, source, owner_id, service_date, group_code, ticket_sequence, request_id)
    values(v_group || '-' || case when v_number < 1000 then lpad(v_number::text,3,'0') else v_number::text end,
      btrim(p_name), p_pax, p_source, v_owner, v_date, v_group, v_number, p_request_id)
    returning * into v_entry;
  return v_entry;
end;
$$;
revoke all on function public.enqueue(text, integer, text, uuid) from public;
grant execute on function public.enqueue(text, integer, text, uuid) to authenticated;

create function public.transition_queue(p_id uuid, p_status text)
returns public.queue_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry public.queue_entries;
begin
  if not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  select * into v_entry from public.queue_entries where id = p_id for update;
  if not found then raise exception 'Antrean tidak ditemukan.'; end if;
  if v_entry.service_date <> (now() at time zone 'Asia/Jakarta')::date then raise exception 'Antrean sudah berakhir.'; end if;
  if p_status is null or not (
    (v_entry.status = 'waiting' and p_status in ('called','no-show')) or
    (v_entry.status = 'called' and p_status in ('seated','no-show'))
  ) then raise exception 'Status sudah berubah. Periksa antrean terbaru.'; end if;
  update public.queue_entries set status = p_status,
    called_at = case when p_status = 'called' then clock_timestamp() else called_at end
    where id = p_id returning * into v_entry;
  return v_entry;
end;
$$;
revoke all on function public.transition_queue(uuid, text) from public;
grant execute on function public.transition_queue(uuid, text) to authenticated;

-- RLS is enforced for Realtime as well. Reconcile on reconnect in the browser.
do $$
begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_entries') then
    alter publication supabase_realtime add table public.queue_entries;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_board') then
    alter publication supabase_realtime add table public.queue_board;
  end if;
end;
$$;
commit;
