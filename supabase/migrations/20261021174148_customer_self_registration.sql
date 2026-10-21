begin;

-- Separate customer entry point: the staff-only enqueue RPC stays unchanged.
-- Anonymous Auth sessions receive the authenticated role, never staff privileges.
create function public.register_customer(p_name text, p_pax integer, p_request_id uuid, p_phone text default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_owner uuid := auth.uid();
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_entry public.queue_entries;
  v_group text;
  v_phone text;
  v_number integer;
  v_token text;
begin
  if v_owner is null then raise exception 'Sesi tamu diperlukan. Silakan coba lagi.'; end if;
  if p_request_id is null then raise exception 'Identitas permintaan diperlukan.'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 60 then
    raise exception 'Nama Tamu wajib diisi, maksimal 60 karakter.';
  end if;
  if p_pax is null or p_pax not between 1 and 12 then raise exception 'Jumlah Orang harus 1 sampai 12.'; end if;
  if p_phone is not null and btrim(p_phone) <> '' then
    if btrim(p_phone) !~ '^[+0-9 ().-]+$' or length(p_phone) > 24 then raise exception 'Nomor telepon tidak valid.'; end if;
    v_phone := regexp_replace(btrim(p_phone), '[ ().-]', '', 'g');
    if v_phone like '0%' then v_phone := '+62' || substr(v_phone,2);
    elsif v_phone like '8%' then v_phone := '+62' || v_phone;
    elsif v_phone not like '+%' then v_phone := '+' || v_phone; end if;
    if v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Nomor telepon tidak valid.'; end if;
  end if;

  -- Share the staff RPC's owner lock. Repeated submissions and concurrent tabs
  -- reuse the same active self-registration, without consuming another number.
  perform pg_advisory_xact_lock(hashtextextended(v_owner::text, 0));
  select * into v_entry from public.queue_entries where request_id=p_request_id;
  if found then
    if v_entry.owner_id <> v_owner or v_entry.source <> 'online' or v_entry.service_date <> v_date then
      raise exception 'Identitas permintaan tidak valid. Muat ulang halaman.';
    end if;
  else
    select * into v_entry from public.queue_entries
      where owner_id=v_owner and source='online' and service_date=v_date and status in ('waiting','called')
      order by created_at,id limit 1;
    if not found then
      v_group := case when p_pax <= 2 then 'A' when p_pax <= 5 then 'B' else 'C' end;
      insert into public.queue_counters(service_date,group_code,last_number) values(v_date,v_group,1)
        on conflict(service_date,group_code) do update set last_number=public.queue_counters.last_number+1
        returning last_number into v_number;
      insert into public.queue_entries(queue_number,customer_name,customer_phone,pax,source,owner_id,
        service_date,group_code,ticket_sequence,request_id,ticket_opened_at)
      values(v_group || '-' || case when v_number<1000 then lpad(v_number::text,3,'0') else v_number::text end,
        btrim(p_name),v_phone,p_pax,'online',v_owner,v_date,v_group,v_number,p_request_id,clock_timestamp())
      returning * into v_entry;
    end if;
  end if;
  -- The insert trigger creates the private capability in this same transaction.
  select token into v_token from qms_private.ticket_access where ticket_id=v_entry.id;
  return jsonb_build_object('id',v_entry.id,'token',v_token);
end;
$$;
revoke all on function public.register_customer(text,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.register_customer(text,integer,uuid,text) to authenticated;

-- Only staff-issued tickets should acknowledge a scan on the shared pickup screen.
create or replace function public.pickup_next(p_screen_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.queue_entries; t text; n integer; d date := (now() at time zone 'Asia/Jakarta')::date;
begin
  if p_screen_token is null or p_screen_token !~ '^[a-f0-9]{64}$' or not exists(
    select 1 from qms_private.pickup_screens where token_hash=encode(sha256(convert_to(p_screen_token,'UTF8')),'hex') and expires_at>now()
  ) then raise exception 'Tautan layar tidak berlaku. Hubungkan ulang dari dashboard staf.'; end if;
  select q.* into r from public.queue_entries q join qms_private.ticket_access a on a.ticket_id=q.id
    where q.service_date=d and q.source='walk-in' and q.ticket_opened_at>clock_timestamp()-interval '4 seconds'
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

commit;
