import { timingSafeEqual } from 'node:crypto';
import { pushConfigured, sendDevicePush, serverDb, type PushJob } from '@/lib/server-push';

export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  const secret = process.env.QMS_WORKER_SECRET;
  const provided = request.headers.get('authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1] ?? '';
  if (!secret || Buffer.byteLength(provided) !== Buffer.byteLength(secret) ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!pushConfigured()) return Response.json({ error: 'Push unavailable' }, { status: 503 });
  try {
    const db = serverDb();
    const { data, error } = await db.rpc('worker_claim_push', { p_secret: secret });
    if (error) throw error;
    const jobs = (data ?? []) as (PushJob & { lease_token: string })[];
    const results = await Promise.all(jobs.map(async job => {
      let result = 'accepted', status = 201;
      try { const response = await sendDevicePush(job); status = response.statusCode; }
      catch (e) {
        status = typeof e === 'object' && e && 'statusCode' in e ? Number(e.statusCode) : 0;
        result = status === 404 || status === 410 ? 'dead' : 'failed';
      }
      const { error: ackError } = await db.rpc('worker_finish_push', {
        p_secret: secret, p_job: job.id, p_lease: job.lease_token,
        p_result: result, p_provider_status: status,
      });
      return !ackError && result === 'accepted';
    }));
    return Response.json({ accepted: results.filter(Boolean).length, failed: results.filter(x => !x).length });
  } catch {
    // Never log capabilities, subscriptions, tokens, or provider responses.
    return Response.json({ error: 'Worker unavailable' }, { status: 503 });
  }
}
