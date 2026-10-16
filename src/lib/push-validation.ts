export type StoredPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export function validatePushSubscription(value: unknown): StoredPushSubscription {
  if (!value || typeof value !== 'object') throw new Error('Data notifikasi tidak valid.');
  const sub = value as Partial<StoredPushSubscription>;
  if (typeof sub.endpoint !== 'string' || sub.endpoint.length > 2048) throw new Error('Alamat notifikasi tidak valid.');
  const url = new URL(sub.endpoint);
  const host = url.hostname;
  const allowed = host === 'fcm.googleapis.com' || host === 'web.push.apple.com' ||
    host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
  if (!allowed || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash)
    throw new Error('Layanan notifikasi perangkat tidak didukung.');
  for (const [name, size] of [['p256dh', 65], ['auth', 16]] as const) {
    const key = sub.keys?.[name];
    if (typeof key !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(key) || Buffer.from(key, 'base64url').length !== size)
      throw new Error('Kunci notifikasi perangkat tidak valid.');
  }
  if (Buffer.from(sub.keys!.p256dh, 'base64url')[0] !== 4) throw new Error('Kunci notifikasi perangkat tidak valid.');
  return { endpoint: sub.endpoint, keys: { p256dh: sub.keys!.p256dh, auth: sub.keys!.auth } };
}
