import { addDemo, readDemo, updateDemo } from "./demo";
import { ensureGuest, isDemo, supabase } from "./supabase";
import {
  validateGuest,
  normalizePhone,
  type QueueEntry,
  type QueueSource,
  type QueueStatus,
} from "./queue";
export async function enqueue(
  name: string,
  pax: number,
  source: QueueSource,
  requestId: string,
  phone = "",
): Promise<QueueEntry> {
  validateGuest(name, pax);
  const customerPhone = normalizePhone(phone);
  if (source !== "walk-in") throw new Error("Pendaftaran hanya melalui staf di restoran.");
  if (isDemo) return addDemo(name, pax, source, requestId, customerPhone);
  const session = await supabase().auth.getSession();
  if (session.error) throw session.error;
  if (!session.data.session) throw new Error("Masuk sebagai staf untuk mendaftarkan tamu.");
  const { data, error } = await supabase().rpc("enqueue", {
    p_name: name.trim(),
    p_pax: pax,
    p_source: source,
    p_request_id: requestId,
    p_phone: customerPhone,
  });
  if (error) throw new Error(error.message);
  return data as QueueEntry;
}
export async function changeStatus(id: string, status: QueueStatus) {
  if (isDemo) return updateDemo(id, status);
  if (status === 'called') return callQueue(id);
  const { error } = await supabase().rpc("transition_queue", {
    p_id: id,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}
export async function callQueue(id: string, retry = false) {
  const {data, error} = await supabase().auth.getSession();
  if(error || !data.session) throw new Error('Sesi berakhir. Silakan masuk kembali.');
  const response = await fetch('/api/queue/call', { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
    body:JSON.stringify({id,retry}) });
  const result = await response.json();
  if(!response.ok) throw new Error(result.error || 'Panggilan belum dapat diproses. Coba lagi.');
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
