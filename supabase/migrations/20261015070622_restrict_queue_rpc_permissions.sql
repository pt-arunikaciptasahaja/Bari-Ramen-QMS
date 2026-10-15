begin;
-- Supabase can grant EXECUTE to anon directly, independently of PUBLIC.
revoke all on function public.is_staff() from public, anon;
revoke all on function public.enqueue(text,integer,text,uuid) from public, anon;
revoke all on function public.transition_queue(uuid,text) from public, anon;
revoke all on function public.sync_queue_board() from public, anon, authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.enqueue(text,integer,text,uuid) to authenticated;
grant execute on function public.transition_queue(uuid,text) to authenticated;
commit;
