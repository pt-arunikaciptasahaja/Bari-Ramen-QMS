import { validateGuest, normalizePhone } from './queue';
import { ensureGuest, isDemo, supabase } from './supabase';
import { validTicketToken } from './tickets';
import { savedVisitToken } from './customer-visit';

export async function registerCustomer(name: string, pax: number, requestId: string, phone: string) {
  validateGuest(name, pax);
  const normalized = normalizePhone(phone);
  if (isDemo) throw new Error('Pendaftaran mandiri memerlukan koneksi Supabase. Silakan minta bantuan staf.');
  await ensureGuest();
  const { data, error } = await supabase().rpc('register_linked_customer', {
    p_name: name.trim(), p_pax: pax, p_request_id: requestId, p_phone: normalized, p_visit_token: savedVisitToken() || null,
  });
  if (error) throw new Error(error.message);
  if (!data || !validTicketToken(data.token)) throw new Error('Tiket belum dapat dibuka. Coba lagi untuk mengambil tiket yang sama.');
  return data as { id: string; token: string; visit_token: string };
}
