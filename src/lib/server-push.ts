import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { validatePushSubscription, type StoredPushSubscription } from './push-validation';

export type PushJob = { id: string; subscription: StoredPushSubscription; token: string; queue_number: string; ticket_id: string; call_count?: number; lease_token?: string };
export function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}
export function serverDb(bearer?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Layanan antrean belum tersedia.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false },
    ...(bearer ? { global: { headers: { Authorization: `Bearer ${bearer}` } } } : {}) });
}
export function verifyOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) throw new Error('Permintaan tidak diizinkan.');
}
export async function requestBody(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > 16000) throw new Error('Permintaan terlalu besar.');
  const text = await request.text();
  if (text.length > 16000) throw new Error('Permintaan terlalu besar.');
  const data: unknown = JSON.parse(text);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Permintaan tidak valid.');
  return data as Record<string, unknown>;
}
export async function sendDevicePush(job: PushJob, test = false) {
  if (!pushConfigured()) throw new Error('Notifikasi belum tersedia.');
  const subscription = validatePushSubscription(job.subscription);
  return webpush.sendNotification(subscription, JSON.stringify({
    title: test ? 'Notifikasi Bari Ramen aktif' : 'Giliran Anda di Bari Ramen',
    body: test ? 'Ini notifikasi uji. Kami akan memberi tahu saat nomor antrean Anda dipanggil.' : `Panggilan ${job.call_count ?? 1}/3 untuk ${job.queue_number}. Silakan kembali ke kasir dan tunjukkan tiket Anda.`,
    url: `/ticket#t=${job.token}`, tag: `bari-${job.ticket_id}-${job.call_count ?? 1}`, expiresAt: Date.now() + 60000,
  }), { TTL: 60, urgency: 'high', timeout: 5000, topic: `q${job.ticket_id.replaceAll('-', '').slice(0, 20)}c${job.call_count ?? 1}`,
    vapidDetails: { subject: 'https://bari-ramen-qms.vercel.app', publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, privateKey: process.env.VAPID_PRIVATE_KEY! } });
}
export async function dispatchTicketPush(db: SupabaseClient, id: string) {
  if (!pushConfigured()) return { accepted: 0, failed: 0, configured: false };
  const { data, error } = await db.rpc('claim_push_jobs', { p_id: id });
  if (error) return { accepted: 0, failed: 1, configured: true };
  const jobs = (data ?? []) as PushJob[];
  const results = await Promise.all(jobs.map(async job => {
    let result = 'accepted', status = 201;
    try { const response = await sendDevicePush(job); status = response.statusCode; }
    catch (error) {
      status = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 0;
      result = status === 404 || status === 410 ? 'dead' : 'failed';
    }
    const { error: ackError } = job.lease_token
      ? await db.rpc('staff_finish_call_push', { p_job: job.id, p_lease: job.lease_token, p_result: result, p_provider_status: status })
      : await db.rpc('finish_push_job', { p_job: job.id, p_result: result, p_provider_status: status });
    if (ackError) return false;
    return result === 'accepted';
  }));
  return { accepted: results.filter(Boolean).length, failed: results.filter(result => !result).length, configured: true };
}
