export function callAgeSeconds(calledAt: string | null, now: number) {
  if (!calledAt || !now) return 0;
  const value = Date.parse(calledAt);
  return Number.isFinite(value) ? Math.max(0, Math.floor((now - value) / 1000)) : 0;
}
export function reminderSlot(calledAt: string | null, now: number) {
  return Math.floor(callAgeSeconds(calledAt, now) / 300);
}
export function warningLevel(calledAt: string | null, now: number) {
  const age = callAgeSeconds(calledAt, now);
  return age >= 180 ? "urgent" : age >= 60 ? "warning" : "normal";
}
export function rowsForHeight(height: number) {
  return Math.max(1, Math.min(10, Math.floor(height / 48)));
}
export function carouselPage<T>(items: T[], index: number, size: number) {
  const capacity = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(items.length / capacity));
  const page = Math.max(0, Math.floor(index)) % pages;
  return { items: items.slice(page * capacity, (page + 1) * capacity), page, pages, offset: page * capacity };
}

export function collectReminders(
  rows: { id: string; status: string; called_at: string | null }[],
  now: number,
  previous: Map<string, number> | null,
) {
  const slots = new Map<string, number>();
  let shouldRing = false;
  for (const row of rows) {
    if (row.status !== "called" || !row.called_at) continue;
    const key = `${row.id}:${row.called_at}`;
    const slot = reminderSlot(row.called_at, now);
    slots.set(key, slot);
    if (previous && slot > 0 && slot > (previous.get(key) ?? 0)) shouldRing = true;
  }
  // Reconnection can cross several minutes; play one bell, never a backlog.
  return { slots, shouldRing };
}
