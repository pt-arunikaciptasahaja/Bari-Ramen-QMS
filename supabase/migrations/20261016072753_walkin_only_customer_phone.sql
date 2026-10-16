-- Preserve existing tickets, and keep phone numbers out of the public board.
begin;
alter table public.queue_entries add column customer_phone text;
alter table public.queue_entries add constraint queue_phone_format check (customer_phone is null or customer_phone ~ '^\+[1-9][0-9]{7,14}$');
drop function public.enqueue(text, integer, text, uuid);
create function public.enqueue(p_name text, p_pax integer, p_source text, p_request_id uuid, p_phone text default null)
returns public.queue_entries
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := auth.uid();
  v_staff boolean := public.is_staff();
  v_date date := (now() at time zone 'Asia/Jakarta')::date;
  v_group text;
  v_number integer;
  v_entry public.queue_entries;
  v_phone text;
begin
  if v_owner is null or not v_staff then raise exception 'Akses staf diperlukan.'; end if;
  if p_source is distinct from 'walk-in' then raise exception 'Pendaftaran hanya melalui staf di restoran.'; end if;
  if p_phone is not null and btrim(p_phone) <> '' then
    if btrim(p_phone) !~ '^[+0-9 ().-]+$' or length(p_phone) > 24 then raise exception 'Nomor telepon tidak valid.'; end if;
    v_phone := regexp_replace(btrim(p_phone), '[ ().-]', '', 'g');
    if v_phone like '0%' then v_phone := '+62' || substr(v_phone,2);
    elsif v_phone like '8%' then v_phone := '+62' || v_phone;
    elsif v_phone not like '+%' then v_phone := '+' || v_phone; end if;
    if v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Nomor telepon tidak valid.'; end if;
  end if;
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
  v_group := case when p_pax <= 2 then 'A' when p_pax <= 4 then 'B' else 'C' end;
  -- Atomic UPSERT uses PostgreSQL row locks, never count(*) + 1.
  insert into public.queue_counters(service_date, group_code, last_number) values(v_date, v_group, 1)
    on conflict(service_date, group_code) do update
      set last_number = public.queue_counters.last_number + 1
    returning last_number into v_number;
  insert into public.queue_entries(queue_number, customer_name, customer_phone, pax, source, owner_id, service_date, group_code, ticket_sequence, request_id)
    values(v_group || '-' || case when v_number < 1000 then lpad(v_number::text,3,'0') else v_number::text end,
      btrim(p_name), v_phone, p_pax, p_source, v_owner, v_date, v_group, v_number, p_request_id)
    returning * into v_entry;
  return v_entry;
end;
$$;
revoke all on function public.enqueue(text, integer, text, uuid, text) from public, anon, authenticated;
grant execute on function public.enqueue(text, integer, text, uuid, text) to authenticated;

commit;
