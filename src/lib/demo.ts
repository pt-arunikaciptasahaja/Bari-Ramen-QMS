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
  phone: string | null = null,
) {
  validateGuest(name, pax);
  if (source !== "walk-in") throw new Error("Pendaftaran hanya melalui staf di restoran.");
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
      customer_phone: phone,
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
    if (status === "called") { entry.called_at = new Date().toISOString(); entry.last_call_at = entry.called_at; entry.call_count = 1; }
    write(rows);
  });
}

// Demo uses a single localStorage write for both the ticket and its audit trail.
type DemoEdit = import('./queue-edits').QueueEdit & { request_id: string };
type EditedDemoEntry = QueueEntry & { recovery_log?: DemoEdit[] };
export function demoEditHistory(id: string) {
  return [...((readDemo().find(row => row.id === id) as EditedDemoEntry | undefined)?.recovery_log ?? [])].reverse();
}
export async function restoreDemo(snapshot: QueueEntry, reason: import('./queue-edits').RecoveryReason, note: string, requestId: string) {
  return locked(() => {
    const rows = readDemo() as EditedDemoEntry[];
    const entry = rows.find(row => row.id === snapshot.id);
    if (!entry || entry.service_date !== serviceDate()) throw new Error('Tiket hanya dapat dipulihkan pada hari pendaftaran.');
    const prior = rows.flatMap(row => (row.recovery_log ?? []).map(edit => ({edit,ticket_id:row.id}))).find(({edit}) => edit.request_id === requestId);
    if (prior) {
      if (prior.ticket_id !== entry.id || prior.edit.reason !== reason || prior.edit.note !== note) throw new Error('Identitas permintaan tidak valid.');
      return entry;
    }
    if (entry.status !== snapshot.status || (entry.edit_count ?? 0) !== (snapshot.edit_count ?? 0) || !['called','seated','no-show'].includes(entry.status)) {
      throw new Error('Status tiket sudah berubah. Muat ulang daftar sebelum mencoba lagi.');
    }
    if (reason === 'late-arrival' && entry.status !== 'no-show') throw new Error('Alasan datang terlambat hanya berlaku untuk antrean yang dilewati.');
    const timestamp = new Date().toISOString(), count = (entry.edit_count ?? 0) + 1;
    const edit: DemoEdit = { id: crypto.randomUUID(), actor_id: 'demo', request_id: requestId,
      created_at: timestamp, from_status: entry.status, to_status: 'waiting', reason, note, edit_number: count };
    entry.recovery_log = [...(entry.recovery_log ?? []),edit];
    Object.assign(entry,{status:'waiting',called_at:null,last_call_at:null,call_count:0,push_status:null,edit_count:count,last_edited_at:timestamp});
    write(rows);
    return entry;
  });
}
