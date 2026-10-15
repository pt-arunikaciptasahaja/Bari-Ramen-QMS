import { addDemo, readDemo, updateDemo } from "./demo";
import { ensureGuest, isDemo, supabase } from "./supabase";
import {
  validateGuest,
  type QueueEntry,
  type QueueSource,
  type QueueStatus,
} from "./queue";
export async function enqueue(
  name: string,
  pax: number,
  source: QueueSource,
  requestId: string,
): Promise<QueueEntry> {
  validateGuest(name, pax);
  if (isDemo) return addDemo(name, pax, source, requestId);
  await ensureGuest();
  const { data, error } = await supabase().rpc("enqueue", {
    p_name: name.trim(),
    p_pax: pax,
    p_source: source,
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data as QueueEntry;
}
export async function changeStatus(id: string, status: QueueStatus) {
  if (isDemo) return updateDemo(id, status);
  const { error } = await supabase().rpc("transition_queue", {
    p_id: id,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
export async function fetchTicket(id: string): Promise<QueueEntry | null> {
  if (isDemo) return readDemo().find((r) => r.id === id) ?? null;
  await ensureGuest();
  const { data, error } = await supabase()
    .from("queue_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
