begin;
-- Private capability bridge between Safari and an isolated Home Screen app.
-- No guest identity, queue status or numbering is rewritten by this migration.
create table qms_private.customer_visit_links (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  seed_ticket_id uuid not null references public.queue_entries(id) on delete cascade,
  ticket_id uuid not null unique references public.queue_entries(id) on delete cascade,
  expires_at timestamptz not null default (now()+interval '30 days')
);
create index customer_visit_links_seed on qms_private.customer_visit_links(seed_ticket_id);
alter table qms_private.customer_visit_links enable row level security;
revoke all on qms_private.customer_visit_links from public,anon,authenticated;

create function public.link_customer_visit(p_token text) returns text
language plpgsql security definer set search_path='' as $$
declare h text; t uuid; canonical text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  h:=encode(sha256(convert_to(p_token,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(h,1));
  if exists(select 1 from qms_private.customer_visit_links where token_hash=h and expires_at>now()) then return p_token; end if;
  select q.id into t from qms_private.ticket_access a join public.queue_entries q on q.id=a.ticket_id
    where a.token=p_token and q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called');
  if t is null then return null; end if;
  -- Opening a current-ticket push URL must retain the existing bridge, not fork it.
  select a.token into canonical from qms_private.customer_visit_links l
    join qms_private.ticket_access a on a.ticket_id=l.seed_ticket_id
    where l.ticket_id=t and l.expires_at>now();
  if canonical is not null then return canonical; end if;
  insert into qms_private.customer_visit_links(token_hash,seed_ticket_id,ticket_id) values(h,t,t)
    on conflict(ticket_id) do update set token_hash=excluded.token_hash,seed_ticket_id=excluded.seed_ticket_id,expires_at=now()+interval '30 days';
  return p_token;
end;
$$;
create function public.resolve_customer_visit(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t text;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select a.token into t from qms_private.customer_visit_links l join qms_private.ticket_access a on a.ticket_id=l.ticket_id
    where l.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and l.expires_at>now();
  if t is null then return null; end if;
  return jsonb_build_object('token',t);
end;
$$;
create function public.register_linked_customer(p_name text,p_pax integer,p_request_id uuid,p_phone text default null,p_visit_token text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text; l qms_private.customer_visit_links; q public.queue_entries; r jsonb; v text;
begin
  if auth.uid() is null then raise exception 'Sesi tamu diperlukan. Silakan coba lagi.'; end if;
  -- Keep owner-before-bridge lock order for concurrent tabs sharing an Auth session.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  if p_visit_token is not null then
    if p_visit_token !~ '^[a-f0-9]{64}$' then raise exception 'Tautan penghubung tidak valid.'; end if;
    h:=encode(sha256(convert_to(p_visit_token,'UTF8')),'hex');
    perform pg_advisory_xact_lock(hashtextextended(h,1));
    select * into l from qms_private.customer_visit_links where token_hash=h and expires_at>now();
    if not found then raise exception 'Tautan penghubung berakhir. Buka kembali tiket Anda sebelum mendaftar.'; end if;
    select * into q from public.queue_entries where id=l.ticket_id;
    if q.service_date=(now() at time zone 'Asia/Jakarta')::date and q.status in ('waiting','called') then
      select token into v from qms_private.ticket_access where ticket_id=q.id;
      return jsonb_build_object('id',q.id,'token',v,'visit_token',p_visit_token);
    end if;
  end if;
  r:=public.register_customer(p_name,p_pax,p_request_id,p_phone);
  -- Reject replay of a completed request rather than moving the bridge backwards.
  select * into q from public.queue_entries where id=(r->>'id')::uuid;
  if q.status not in ('waiting','called') then raise exception 'Permintaan ini sudah selesai. Muat ulang formulir untuk kunjungan baru.'; end if;
  if h is null then
    v:=public.link_customer_visit(r->>'token');
  else
    update qms_private.customer_visit_links set ticket_id=q.id where token_hash=h;
    v:=p_visit_token;
  end if;
  return r || jsonb_build_object('visit_token',v);
end;
$$;
revoke all on function public.link_customer_visit(text),public.resolve_customer_visit(text),public.register_linked_customer(text,integer,uuid,text,text) from public,anon,authenticated;
grant execute on function public.link_customer_visit(text),public.resolve_customer_visit(text) to anon,authenticated;
grant execute on function public.register_linked_customer(text,integer,uuid,text,text) to authenticated;
commit;
