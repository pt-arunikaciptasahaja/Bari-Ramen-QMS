import type { BoardEntry, QueueEntry } from './queue';
import { isDemo, supabase } from './supabase';

export type CustomerTicket = Pick<BoardEntry, 'id' | 'queue_number' | 'pax' | 'group_code' | 'status' | 'created_at' | 'called_at' | 'service_date' | 'ticket_sequence' | 'call_count' | 'last_call_at'>;
export type PickupState = { kind: 'empty'; pending: number } | {
  kind: 'opened'; queue_number: string; pax: number; group_code: QueueEntry['group_code'];
} | { kind: 'ticket'; id: string; queue_number: string; pax: number; group_code: QueueEntry['group_code']; token: string; pending: number };
export const validTicketToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
export function ticketUrl(origin: string, token: string) {
  if (!validTicketToken(token)) throw new Error('Tautan tiket tidak valid.');
  return `${origin}/ticket#t=${token}`;
}
export function fragmentToken(key: string) {
  const value = new URLSearchParams(window.location.hash.slice(1)).get(key) ?? '';
  return validTicketToken(value) ? value : '';
}
async function rpc<T>(name: string, args = {}): Promise<T> {
  if (isDemo) throw new Error('Pengambilan tiket antarperangkat memerlukan koneksi Supabase.');
  const { data, error } = await supabase().rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}
export const createPickupScreen = () => rpc<{token: string; expires_at: string}>('create_pickup_screen');
export const fetchPickup = (token: string) => rpc<PickupState>('pickup_next', {p_screen_token: token});
export const fetchCustomerTicket = (token: string, markOpen = false) => rpc<CustomerTicket | null>('customer_ticket', {p_token: token, p_mark_open: markOpen});
export const staffTicketToken = (id: string) => rpc<string>('staff_ticket_token', {p_id: id});
export const skipTicketHandoff = (id: string) => rpc<void>('skip_ticket_handoff', {p_id: id});
