export const PUSH_PREFERENCE_KEY = 'bari-push-preference-v1';

export function applicationKey(value: string): ArrayBuffer {
  const decoded = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(decoded, char => char.charCodeAt(0)).buffer;
}

// Call synchronously from the tap handler. Safari must retain user activation;
// do not await permission, registration, or getSubscription before subscribe().
export function subscribeFromTap(registration: ServiceWorkerRegistration, key: string) {
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey(key) });
}

export async function reconnectPush(
  registration: ServiceWorkerRegistration,
  ticketToken: string,
  request: (body: Record<string, unknown>) => Promise<{ active?: boolean }>,
  disabled: boolean,
  permission: NotificationPermission,
) {
  if (disabled || permission !== 'granted') return false;
  const sub = await registration.pushManager.getSubscription();
  if (!sub) return false; // Never prompt or silently create a subscription on load.
  const result = await request({ action: 'status', ticketToken, endpoint: sub.endpoint });
  if (!result.active) await request({ action: 'subscribe', ticketToken, subscription: sub.toJSON() });
  return true;
}
