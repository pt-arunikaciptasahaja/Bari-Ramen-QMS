import { normalizePhone, serviceDate, type QueueEntry } from "./queue";

export const WHATSAPP_DELAY_SECONDS = 180;
type ContactEntry = Pick<QueueEntry, "customer_phone" | "customer_name" | "queue_number" | "status" | "called_at" | "service_date">;

export function whatsappState(entry: ContactEntry, now: number) {
  let phone: string | null = null;
  try { phone = normalizePhone(entry.customer_phone ?? ""); } catch { /* Invalid legacy numbers stay disabled. */ }
  const called = entry.called_at ? Date.parse(entry.called_at) : NaN;
  const active = entry.status === "called" && Number.isFinite(now) && now > 0 &&
    Number.isFinite(called) && called <= now && entry.service_date === serviceDate(new Date(now));
  const remaining = active ? Math.max(0, WHATSAPP_DELAY_SECONDS - Math.floor((now - called) / 1000)) : WHATSAPP_DELAY_SECONDS;
  return { enabled: Boolean(phone && active && remaining === 0), remaining, hasPhone: Boolean(phone) };
}

export function whatsappMessage(entry: ContactEntry) {
  return `Halo Kak ${entry.customer_name}, nomor antrean ${entry.queue_number} di Bari Ramen sudah dipanggil. Silakan menuju kasir untuk konfirmasi giliran. Terima kasih.`;
}

export function whatsappLink(entry: ContactEntry, now: number) {
  if (!whatsappState(entry, now).enabled) return null;
  const phone = normalizePhone(entry.customer_phone ?? "");
  if (!phone) return null;
  return `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(whatsappMessage(entry))}`;
}
