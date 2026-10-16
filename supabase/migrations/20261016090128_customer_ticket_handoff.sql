begin;
create schema if not exists qms_private;
revoke all on schema qms_private from public, anon, authenticated;
alter table public.queue_entries add column ticket_opened_at timestamptz;
alter table public.queue_entries add column ticket_skipped_at timestamptz;

-- These capability tokens are never included in queue_entries or queue_board.
create table qms_private.ticket_access (
  ticket_id uuid primary key references public.queue_entries(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text,'-','')
);
create table qms_private.pickup_screens (
  token_hash text primary key,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null
);
alter table qms_private.ticket_access enable row level security;
alter table qms_private.pickup_screens enable row level security;
revoke all on all tables in schema qms_private from public, anon, authenticated;

create function qms_private.prepare_ticket_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into qms_private.ticket_access(ticket_id) values(new.id);
  return new;
end;
$$;
revoke all on function qms_private.prepare_ticket_access() from public, anon, authenticated;
create trigger prepare_ticket_access after insert on public.queue_entries
for each row execute function qms_private.prepare_ticket_access();
insert into qms_private.ticket_access(ticket_id)
select id from public.queue_entries where service_date=(now() at time zone 'Asia/Jakarta')::date and status in ('waiting','called');

create function public.create_pickup_screen() returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text := replace(gen_random_uuid()::text || gen_random_uuid()::text,'-',''); e timestamptz := now()+interval '12 hours';
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  insert into qms_private.pickup_screens(token_hash,created_by,expires_at)
    values(encode(sha256(convert_to(t,'UTF8')),'hex'),auth.uid(),e);
  return jsonb_build_object('token',t,'expires_at',e);
end;
$$;

create function public.pickup_next(p_screen_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; t text; n integer; d date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_screen_token is null or p_screen_token !~ '^[a-f0-9]{64}$' or not exists(
    select 1 from qms_private.pickup_screens where token_hash=encode(sha256(convert_to(p_screen_token,'UTF8')),'hex') and expires_at>now()
  ) then raise exception 'Tautan layar tidak berlaku. Hubungkan ulang dari dashboard staf.'; end if;
  -- Brief acknowledgement is shared by all displays before the next QR appears.
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where q.service_date=d and q.ticket_opened_at>clock_timestamp()-interval '4 seconds'
    order by q.ticket_opened_at desc limit 1;
  if found then return jsonb_build_object('kind','opened','queue_number',r.queue_number,'pax',r.pax,'group_code',r.group_code); end if;
  select count(*) into n from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where q.service_date=d and q.status in ('waiting','called') and q.ticket_opened_at is null and q.ticket_skipped_at is null;
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where q.service_date=d and q.status in ('waiting','called') and q.ticket_opened_at is null and q.ticket_skipped_at is null
    order by q.created_at,q.id limit 1;
  if not found then return jsonb_build_object('kind','empty','pending',0); end if;
  select token into t from qms_private.ticket_access where ticket_id=r.id;
  return jsonb_build_object('kind','ticket','id',r.id,'queue_number',r.queue_number,'pax',r.pax,'group_code',r.group_code,'token',t,'pending',n);
end;
$$;

create function public.customer_ticket(p_token text, p_mark_open boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date;
  if not found then return null; end if;
  if p_mark_open and r.ticket_opened_at is null and r.status in ('waiting','called') then
    update public.queue_entries set ticket_opened_at=coalesce(ticket_opened_at,clock_timestamp())
      where id=r.id returning * into r;
  end if;
  -- Read-only ticket details: no name, phone, owner, retry ID, or other guests.
  return jsonb_build_object('id',r.id,'queue_number',r.queue_number,'pax',r.pax,'group_code',r.group_code,
    'status',r.status,'created_at',r.created_at,'called_at',r.called_at,'service_date',r.service_date,'ticket_sequence',r.ticket_sequence);
end;
$$;

create function public.staff_ticket_token(p_id uuid) returns text
language plpgsql security definer set search_path='' as $$
declare t text;
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  if not exists(select 1 from public.queue_entries where id=p_id and service_date=(now() at time zone 'Asia/Jakarta')::date) then raise exception 'Tiket tidak tersedia.'; end if;
  insert into qms_private.ticket_access(ticket_id) values(p_id) on conflict(ticket_id) do nothing;
  select token into t from qms_private.ticket_access where ticket_id=p_id;
  return t;
end;
$$;

create function public.skip_ticket_handoff(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  update public.queue_entries set ticket_skipped_at=clock_timestamp()
    where id=p_id and service_date=(now() at time zone 'Asia/Jakarta')::date
      and status in ('waiting','called') and ticket_opened_at is null and ticket_skipped_at is null;
  if not found then raise exception 'Tiket sudah berubah. Muat ulang antrean.'; end if;
end;
$$;

revoke all on function public.create_pickup_screen(), public.pickup_next(text), public.customer_ticket(text,boolean), public.staff_ticket_token(uuid), public.skip_ticket_handoff(uuid) from public, anon, authenticated;
grant execute on function public.create_pickup_screen(), public.staff_ticket_token(uuid), public.skip_ticket_handoff(uuid) to authenticated;
grant execute on function public.pickup_next(text), public.customer_ticket(text,boolean) to anon, authenticated;
commit;
