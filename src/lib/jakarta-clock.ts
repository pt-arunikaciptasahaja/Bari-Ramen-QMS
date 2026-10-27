const partsFormat = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Jakarta', weekday:'short', day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' });
export function formatJakartaClock(now: number) {
  if (!Number.isFinite(now) || now <= 0) return '';
  const parts = Object.fromEntries(partsFormat.formatToParts(now).map(part => [part.type,part.value]));
  return `${parts.weekday}, ${parts.day}-${parts.month}-${parts.year}, ${parts.hour}:${parts.minute}`;
}
