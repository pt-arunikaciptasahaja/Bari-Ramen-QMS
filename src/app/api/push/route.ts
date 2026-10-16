import { createHash } from 'node:crypto';
import { requestBody, serverDb, verifyOrigin, pushConfigured, sendDevicePush, type PushJob } from '@/lib/server-push';
import { validatePushSubscription } from '@/lib/push-validation';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    verifyOrigin(request);
    if (!pushConfigured()) return Response.json({ error: 'Notifikasi belum tersedia. Silakan pantau tiket atau hubungi staf.' }, { status: 503 });
    const body = await requestBody(request);
    if (typeof body.ticketToken !== 'string' || !/^[a-f0-9]{64}$/.test(body.ticketToken)) throw new Error('Tiket tidak valid.');
    const db = serverDb();
    const token = body.ticketToken;
    if (body.action === 'subscribe') {
      const subscription = validatePushSubscription(body.subscription);
      const { error } = await db.rpc('save_push_subscription', { p_token: token, p_endpoint: subscription.endpoint, p_key: subscription.keys.p256dh, p_auth: subscription.keys.auth });
      if (error) throw new Error('Notifikasi belum tersimpan. Pastikan tiket masih aktif, lalu coba lagi.');
      return Response.json({ active: true });
    }
    if (typeof body.endpoint !== 'string' || body.endpoint.length > 2048) throw new Error('Perangkat belum terdaftar.');
    const hash = createHash('sha256').update(body.endpoint).digest('hex');
    if (body.action === 'status') {
      const { data, error } = await db.rpc('ticket_push_status', { p_token: token, p_endpoint_hash: hash });
      if (error) throw new Error('Status notifikasi belum dapat diperiksa.');
      return Response.json({ active: Boolean(data) });
    }
    if (body.action === 'unsubscribe') {
      const { error } = await db.rpc('remove_push_subscription', { p_token: token, p_endpoint_hash: hash });
      if (error) throw new Error('Notifikasi belum dapat dinonaktifkan. Coba lagi.');
      return Response.json({ active: false });
    }
    if (body.action === 'test') {
      const { data, error } = await db.rpc('push_test_target', { p_token: token, p_endpoint_hash: hash });
      if (error || !data) return Response.json({ error: 'Tunggu 30 detik sebelum menguji lagi. Pastikan tiket dan notifikasi masih aktif.' }, { status: 429 });
      try { await sendDevicePush(data as PushJob, true); }
      catch { return Response.json({ error: 'Notifikasi uji belum terkirim. Periksa koneksi dan izin perangkat.' }, { status: 502 }); }
      return Response.json({ accepted: true });
    }
    throw new Error('Permintaan tidak valid.');
  } catch {
    return Response.json({ error: 'Permintaan notifikasi tidak dapat diproses. Periksa tiket dan coba lagi.' }, { status: 400 });
  }
}
