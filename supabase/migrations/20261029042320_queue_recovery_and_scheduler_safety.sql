begin;
-- Additive identity history: no queue statuses, counters or customer details change.
alter table qms_private.customer_visit_links add column party_id uuid not null default gen_random_uuid();
alter table qms_private.customer_visit_links add constraint customer_visit_links_party_key unique(party_id);
create table qms_private.customer_visit_members (
  ticket_id uuid primary key references public.queue_entries(id) on delete cascade,
  party_id uuid not null references qms_private.customer_visit_links(party_id) on delete cascade
);
create index customer_visit_members_party on qms_private.customer_visit_members(party_id);
alter table qms_private.customer_visit_members enable row level security;
revoke all on qms_private.customer_visit_members from public,anon,authenticated;
-- Only known seed/current relationships can be backfilled. Never infer a party
-- from names, phones or proximity in time, and never guess conflicting identity.
do $$
begin
  if exists(select ticket_id from (
    select seed_ticket_id ticket_id,party_id from qms_private.customer_visit_links
    union select ticket_id,party_id from qms_private.customer_visit_links
  ) x group by ticket_id having count(distinct party_id)>1) then
    raise exception 'Conflicting visit identities require review before migration.';
  end if;
end;
$$;
insert into qms_private.customer_visit_members(ticket_id,party_id)
select seed_ticket_id,party_id from qms_private.customer_visit_links
union select ticket_id,party_id from qms_private.customer_visit_links;

-- Small-volume customer identity mutations share one short database-only lock.
-- Take it BEFORE existing owner/bridge/row locks in every registration, linking
-- and recovery entry point. This avoids cross-owner lock inversions. Ordinary
-- staff calls, seating, scheduler ticks, reads and push dispatch do not take it.
create function qms_private.lock_customer_visits() returns void
language sql security definer set search_path='' as $$
  select pg_advisory_xact_lock(hashtextextended('qms_customer_visit_identity',11));
$$;
revoke all on function qms_private.lock_customer_visits() from public,anon,authenticated;
create function qms_private.record_visit_member(p_ticket uuid,p_party uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into qms_private.customer_visit_members(ticket_id,party_id) values(p_ticket,p_party)
    on conflict(ticket_id) do nothing;
  if not exists(select 1 from qms_private.customer_visit_members where ticket_id=p_ticket and party_id=p_party) then
    raise exception 'Tiket sudah terhubung ke kunjungan lain. Gunakan tiket aktif Anda.';
  end if;
end;
$$;
revoke all on function qms_private.record_visit_member(uuid,uuid) from public,anon,authenticated;

create or replace function public.link_customer_visit(p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare h text; t uuid; party uuid; canonical text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  if not exists(select 1 from qms_private.ticket_access where token=p_token) then return null; end if;
  perform qms_private.lock_customer_visits();
  perform pg_advisory_xact_lock(hashtextextended(h,1));
  if exists(select 1 from qms_private.customer_visit_links where token_hash=h and expires_at>now()) then return p_token; end if;
  select q.id into t from qms_private.ticket_access a join public.queue_entries q on q.id=a.ticket_id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called');
  if t is null then return null; end if;
  select party_id into party from qms_private.customer_visit_members where ticket_id=t;
  if party is not null then
    select a.token into canonical from qms_private.customer_visit_links l
      join qms_private.ticket_access a on a.ticket_id=l.seed_ticket_id
      where l.party_id=party and l.expires_at>now();
    if canonical is not null then return canonical; end if;
    -- Rotate an expired bridge using proof of its current active ticket. History
    -- remains intact; expired seed capabilities are not revived by resolve.
    update qms_private.customer_visit_links set token_hash=h,seed_ticket_id=t,ticket_id=t,
      expires_at=clock_timestamp()+interval '30 days' where party_id=party;
  else
    insert into qms_private.customer_visit_links(token_hash,seed_ticket_id,ticket_id) values(h,t,t)
      returning party_id into party;
    perform qms_private.record_visit_member(t,party);
  end if;
  return p_token;
end;
$$;

-- Keep the existing API/response compatible while removing the legacy bypass:
-- old clients also record party membership. The original implementation remains
-- a private helper and continues to own validation, numbering and retry checks.
alter function public.register_customer(text,integer,uuid,text) set schema qms_private;
revoke all on function qms_private.register_customer(text,integer,uuid,text) from public,anon,authenticated;
create function public.register_customer(p_name text,p_pax integer,p_request_id uuid,p_phone text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'Sesi tamu diperlukan. Silakan coba lagi.'; end if;
  perform qms_private.lock_customer_visits();
  r:=qms_private.register_customer(p_name,p_pax,p_request_id,p_phone);
  perform public.link_customer_visit(r->>'token');
  return r;
end;
$$;
revoke all on function public.register_customer(text,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.register_customer(text,integer,uuid,text) to authenticated;

create or replace function public.register_linked_customer(p_name text,p_pax integer,p_request_id uuid,p_phone text default null,p_visit_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; l qms_private.customer_visit_links; q public.queue_entries; r jsonb; v text; active_count integer;
begin
  if auth.uid() is null then raise exception 'Sesi tamu diperlukan. Silakan coba lagi.'; end if;
  perform qms_private.lock_customer_visits();
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if p_visit_token is not null then
    if p_visit_token !~ '^[a-f0-9]{64}$' then raise exception 'Tautan penghubung tidak valid.'; end if;
    h:=encode(sha256(convert_to(p_visit_token,'UTF8')),'hex');
    perform pg_advisory_xact_lock(hashtextextended(h,1));
    select * into l from qms_private.customer_visit_links where token_hash=h and expires_at>now();
    if not found then raise exception 'Tautan penghubung berakhir. Buka kembali tiket Anda sebelum mendaftar.'; end if;
    select count(*) into active_count from public.queue_entries e join qms_private.customer_visit_members m on m.ticket_id=e.id
      where m.party_id=l.party_id and e.service_date=(now() at time zone 'Asia/Jakarta')::date and e.status in ('waiting','called');
    if active_count>1 then raise exception 'Ada lebih dari satu tiket aktif terhubung. Minta staf memeriksa antrean Anda.'; end if;
    if active_count=1 then
      select e.* into q from public.queue_entries e join qms_private.customer_visit_members m on m.ticket_id=e.id
        where m.party_id=l.party_id and e.service_date=(now() at time zone 'Asia/Jakarta')::date and e.status in ('waiting','called');
      select token into v from qms_private.ticket_access where ticket_id=q.id;
      update qms_private.customer_visit_links set ticket_id=q.id where party_id=l.party_id;
      return jsonb_build_object('id',q.id,'token',v,'visit_token',p_visit_token);
    end if;
  end if;
  r:=qms_private.register_customer(p_name,p_pax,p_request_id,p_phone);
  select * into q from public.queue_entries where id=(r->>'id')::uuid;
  if q.status not in ('waiting','called') then raise exception 'Permintaan ini sudah selesai. Muat ulang formulir untuk kunjungan baru.'; end if;
  if h is null then
    v:=public.link_customer_visit(r->>'token');
  else
    perform qms_private.record_visit_member(q.id,l.party_id);
    update qms_private.customer_visit_links set ticket_id=q.id where party_id=l.party_id;
    v:=p_visit_token;
  end if;
  return r || jsonb_build_object('visit_token',v);
end;
$$;
create or replace function public.restore_queue(p_id uuid,p_expected_status text,p_expected_edit_count integer,
  p_reason text,p_note text,p_request_id uuid) returns public.queue_entries
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; prior qms_private.queue_edits; owner uuid; party uuid; note_text text:=btrim(coalesce(p_note,''));
begin
  if auth.uid() is null or not public.is_staff() then raise exception 'Akses staf diperlukan.'; end if;
  if p_request_id is null or p_id is null or p_reason is null or p_reason not in ('late-arrival','staff-error','operational')
    or p_expected_status is null or p_expected_status not in ('called','seated','no-show')
    or p_expected_edit_count is null or p_expected_edit_count<0 or char_length(note_text)>200 then
    raise exception 'Data pemulihan tidak valid. Pilih alasan dan periksa kembali tiket.';
  end if;
  perform qms_private.lock_customer_visits();
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7));
  select * into prior from qms_private.queue_edits where request_id=p_request_id;
  if found then
    if prior.ticket_id<>p_id or prior.actor_id<>auth.uid() or prior.reason<>p_reason or prior.note<>note_text
      or prior.from_status<>p_expected_status or prior.edit_number<>p_expected_edit_count+1 then
      raise exception 'Identitas permintaan tidak valid.';
    end if;
    select * into r from public.queue_entries where id=p_id;
    if r.service_date<>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tiket hanya dapat dipulihkan pada hari pendaftaran.'; end if;
    return r;
  end if;
  select owner_id into owner from public.queue_entries where id=p_id;
  if owner is null then raise exception 'Tiket tidak ditemukan.'; end if;
  -- Same owner lock as registration: a guest cannot gain two active tickets.
  perform pg_advisory_xact_lock(hashtextextended(owner::text,0));
  -- Same lock order as push acknowledgements: serialize before changing the row.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,2));
  select * into r from public.queue_entries where id=p_id for update;
  if r.service_date<>(now() at time zone 'Asia/Jakarta')::date then raise exception 'Tiket hanya dapat dipulihkan pada hari pendaftaran.'; end if;
  if r.status<>p_expected_status or r.edit_count<>p_expected_edit_count then
    raise exception 'Status tiket sudah berubah. Muat ulang daftar sebelum mencoba lagi.';
  end if;
  if p_reason='late-arrival' and r.status<>'no-show' then raise exception 'Alasan datang terlambat hanya berlaku untuk antrean yang dilewati.'; end if;
  if not exists(select 1 from public.staff_members where user_id=r.owner_id)
    and exists(select 1 from public.queue_entries where owner_id=r.owner_id and service_date=r.service_date
      and id<>r.id and status in ('waiting','called')) then
    raise exception 'Pelanggan ini sudah memiliki antrean aktif. Gunakan tiket yang masih aktif.';
  end if;
  select party_id into party from qms_private.customer_visit_members where ticket_id=r.id;
  if party is null and r.source='online' then
    -- Unrecorded intermediate visits from before this migration cannot be linked
    -- reliably. Fail closed instead of guessing identity or changing old tickets.
    raise exception 'Riwayat tautan tiket lama belum lengkap. Hubungi pengelola untuk memeriksa tiket aktif sebelum pemulihan.';
  end if;
  if party is not null and exists(
    select 1 from public.queue_entries e join qms_private.customer_visit_members m on m.ticket_id=e.id
      where m.party_id=party and e.service_date=r.service_date and e.id<>r.id and e.status in ('waiting','called')
  ) then raise exception 'Pelanggan ini sudah memiliki antrean aktif terhubung. Gunakan tiket yang masih aktif.'; end if;
  insert into qms_private.queue_edits(ticket_id,actor_id,request_id,from_status,reason,note,previous_call,edit_number)
    values(r.id,auth.uid(),p_request_id,r.status,p_reason,note_text,
      jsonb_build_object('called_at',r.called_at,'last_call_at',r.last_call_at,'call_count',r.call_count,'push_status',r.push_status),r.edit_count+1);
  -- Invalidate pending work from the old cycle; retain records for audit.
  update qms_private.push_jobs set cancelled_at=clock_timestamp(),state='failed',attempts=3,lease_token=null
    where ticket_id=r.id and state in ('pending','sending','failed') and cancelled_at is null;
  update public.queue_entries set status='waiting',called_at=null,last_call_at=null,call_count=0,push_status=null,
    edit_count=edit_count+1,last_edited_at=clock_timestamp() where id=r.id returning * into r;
  if party is not null then
    update qms_private.customer_visit_links set ticket_id=r.id where party_id=party;
  end if;
  return r;
end;
$$;
revoke all on function public.restore_queue(uuid,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.restore_queue(uuid,text,integer,text,text,uuid) to authenticated;


-- Filter the time-derived target BEFORE LIMIT, so completed reminder rows
-- cannot occupy every slot and starve the rest of the due queue.
create or replace function qms_private.advance_queue_calls() returns integer
language plpgsql security definer set search_path='' as $$
declare r record; target integer; changed integer:=0; tick timestamptz:=clock_timestamp();
begin
  if not exists(select 1 from qms_private.scheduler_config where enabled) then return 0; end if;
  for r in select id,called_at,call_count from public.queue_entries
    where status='called' and call_count>0 and called_at<=tick-(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '3 minutes' else interval '5 minutes' end)
      and (called_at<=tick-(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end)
        or call_count < case when called_at<=tick-(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '6 minutes' else interval '10 minutes' end) then 3 else 2 end)
    order by called_at,id limit 200 for update skip locked
  loop
    if r.called_at<=tick-(case when r.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '10 minutes' else interval '15 minutes' end) then
      update public.queue_entries set status='no-show' where id=r.id and status='called';
      changed:=changed+1;
    else
      target:=case when r.called_at<=tick-(case when r.called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '6 minutes' else interval '10 minutes' end) then 3 else 2 end;
      if target>r.call_count then
        update public.queue_entries set call_count=target,
          last_call_at=called_at+((target-1)*(case when called_at>=(select call_policy_started_at from qms_private.scheduler_config) then interval '3 minutes' else interval '5 minutes' end)) where id=r.id and status='called';
        changed:=changed+1;
      end if;
    end if;
  end loop;
  return changed;
end;
$$;
revoke all on function qms_private.advance_queue_calls() from public,anon,authenticated;


revoke all on function public.link_customer_visit(text),public.register_linked_customer(text,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.link_customer_visit(text) to anon,authenticated;
grant execute on function public.register_linked_customer(text,integer,uuid,text,text) to authenticated;
commit;
