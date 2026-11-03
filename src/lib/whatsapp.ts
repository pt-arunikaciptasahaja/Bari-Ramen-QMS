import { normalizePhone, serviceDate, type QueueEntry } from "./queue";

export const BARI_WHATSAPP = "+62 852-1996-9592";
type ContactEntry = Pick<QueueEntry, "customer_phone" | "customer_name" | "queue_number" | "status" | "service_date">;

export function whatsappState(entry: ContactEntry, now: number) {
  let phone: string | null = null;
  try { phone = normalizePhone(entry.customer_phone ?? ""); } catch { /* Invalid legacy numbers stay disabled. */ }
  const active = ['waiting', 'called'].includes(entry.status) && Number.isFinite(now) && now > 0 &&
    entry.service_date === serviceDate(new Date(now));
  return { enabled: Boolean(phone && active), hasPhone: Boolean(phone) };
}

export function whatsappMessage(entry: ContactEntry) {
  if (entry.status === 'waiting') {
    return `Halo ${entry.customer_name}, kami dari Bari Ramen (${BARI_WHATSAPP}). Nomor antrean ${entry.queue_number} masih dalam daftar tunggu. Silakan tetap berada di sekitar restoran dan pantau tiket Anda. Kami akan memberi tahu saat giliran Anda tiba. Terima kasih.`;
  }
  return `Halo ${entry.customer_name}, kami dari Bari Ramen (${BARI_WHATSAPP}). Nomor antrean ${entry.queue_number} sudah dipanggil. Silakan segera menuju kasir dan tunjukkan tiket Anda. Jika sudah berada di restoran, mohon lapor kepada staf. Terima kasih.`;
}

export function whatsappLink(entry: ContactEntry, now: number) {
  if (!whatsappState(entry, now).enabled) return null;
  const phone = normalizePhone(entry.customer_phone ?? "");
  if (!phone) return null;
  return `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(whatsappMessage(entry))}`;
}
