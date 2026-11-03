import { createHmac, timingSafeEqual } from 'node:crypto';

// pg_net's extension-owned request queue may be readable by database roles.
// Never put the long-lived shared secret in an outgoing HTTP header.
export function validWorkerRequest(headers: Headers, secret: string | undefined, now = Date.now()) {
  const timestamp = headers.get('x-qms-timestamp') ?? '';
  const receipt = headers.get('x-qms-receipt') ?? '';
  const signature = headers.get('x-qms-signature') ?? '';
  if (!secret || !/^\d{10}$/.test(timestamp) || !/^[a-f0-9-]{36}$/.test(receipt) || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const age = now - Number(timestamp) * 1000;
  if (age < -5000 || age > 30000) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}:${receipt}`).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}
