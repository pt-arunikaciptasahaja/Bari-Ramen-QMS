import { isDemo, supabase } from './supabase';
import { validTicketToken } from './tickets';
export const CUSTOMER_VISIT_KEY = 'bari-customer-visit-v1';
export function importedTicketToken(value: string, origin: string) {
  try {
    const url = new URL(value.trim());
    if (url.origin !== origin || url.pathname !== '/ticket' || url.search || url.username || url.password) return '';
    const token = new URLSearchParams(url.hash.slice(1)).get('t') ?? '';
    return validTicketToken(token) ? token : '';
  } catch { return ''; }
}
export function savedVisitToken() {
  try { const token=localStorage.getItem(CUSTOMER_VISIT_KEY)??''; return validTicketToken(token)?token:''; } catch { return ''; }
}
export function saveVisitToken(token: string) {
  try { localStorage.setItem(CUSTOMER_VISIT_KEY,token); } catch { /* Private URL remains usable. */ }
}
export async function linkCustomerVisit(token: string) {
  if (isDemo) return '';
  const {data,error}=await supabase().rpc('link_customer_visit',{p_token:token});
  if(error)throw new Error('Tiket belum dapat dihubungkan. Periksa koneksi dan coba lagi.');
  return typeof data==='string'&&validTicketToken(data)?data:'';
}
export async function resolveCustomerVisit(token: string) {
  if (!validTicketToken(token)||isDemo) return '';
  const {data,error}=await supabase().rpc('resolve_customer_visit',{p_token:token});
  if(error)throw new Error('Tiket terhubung belum dapat dimuat. Periksa koneksi dan coba lagi.');
  return data&&validTicketToken(data.token)?data.token as string:'';
}
