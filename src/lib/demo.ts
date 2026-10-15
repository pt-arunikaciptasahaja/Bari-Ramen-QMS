import {
  canTransition,
  groupFor,
  serviceDate,
  validateGuest,
  type QueueEntry,
  type QueueSource,
  type QueueStatus,
} from "./queue";
const KEY = "bari-qms-demo-v1";
export const DEMO_EVENT = "bari-queue-change";
export function readDemo(): QueueEntry[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const result: unknown = JSON.parse(raw);
    return Array.isArray(result) ? result : [];
  } catch {
    throw new Error(
      "Data demo tidak dapat dibaca. Hapus data situs demo melalui pengaturan browser.",
    );
  }
}
function write(rows: QueueEntry[]) {
  localStorage.setItem(KEY, JSON.stringify(rows));
  window.dispatchEvent(new Event(DEMO_EVENT));
}
async function locked<T>(action: () => T): Promise<T> {
  if (navigator.locks)
    return navigator.locks.request("bari-demo-write", action);
  return action(); // Demo-only fallback. PostgreSQL handles real concurrency.
}
export async function addDemo(
  name: string,
  pax: number,
  source: QueueSource,
  request: string,
) {
  validateGuest(name, pax);
  return locked(() => {
    const rows = readDemo();
    const existing = rows.find((r) => r.request_id === request);
    if (existing) return existing;
    const day = serviceDate();
    const group = groupFor(pax);
    const n =
      1 +
      Math.max(
        0,
        ...rows
          .filter((r) => r.service_date === day && r.group_code === group)
          .map((r) => r.ticket_sequence),
      );
    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      queue_number: `${group}-${String(n).padStart(3, "0")}`,
      customer_name: name.trim(),
      pax,
      source,
      status: "waiting",
      created_at: new Date().toISOString(),
      called_at: null,
      service_date: day,
      group_code: group,
      ticket_sequence: n,
      request_id: request,
    };
    write([...rows, entry]);
    return entry;
  });
}
export async function updateDemo(id: string, status: QueueStatus) {
  return locked(() => {
    const rows = readDemo();
    const entry = rows.find((r) => r.id === id);
    if (
      !entry ||
      entry.service_date !== serviceDate() ||
      !canTransition(entry.status, status)
    )
      throw new Error("Status sudah berubah. Periksa antrean terbaru.");
    entry.status = status;
    if (status === "called") entry.called_at = new Date().toISOString();
    write(rows);
  });
}
