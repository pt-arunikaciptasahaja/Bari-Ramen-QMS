begin;
-- pg_net defaults may grant browser roles access to outbound HTTP headers.
-- Restrict the transport itself, not just the application configuration table.
-- Local portable test databases have no pg_net extension.
do $$
begin
  if exists(select 1 from pg_namespace where nspname='net') then
    revoke all on schema net from public,anon,authenticated;
    revoke all on all tables in schema net from public,anon,authenticated;
    revoke all on all sequences in schema net from public,anon,authenticated;
    revoke all on all functions in schema net from public,anon,authenticated;
    grant usage on schema net to postgres;
    grant all on all tables in schema net to postgres;
    grant usage on all sequences in schema net to postgres;
    grant execute on all functions in schema net to postgres;
  end if;
end;
$$;
commit;
