export type QueueStatus = "waiting" | "called" | "seated" | "no-show";
export type QueueSource = "walk-in" | "online";
export type QueueEntry = {
  id: string;
  queue_number: string;
  customer_name: string;
  pax: number;
  source: QueueSource;
  status: QueueStatus;
  created_at: string;
  called_at: string | null;
  service_date: string;
  ticket_sequence: number;
  group_code: "A" | "B" | "C";
  request_id: string;
};
export type BoardEntry = Omit<QueueEntry, "customer_name" | "request_id">;
export const statusLabel: Record<QueueStatus, string> = {
  waiting: "Menunggu",
  called: "Silakan ke Kasir",
  seated: "Meja Diberikan",
  "no-show": "Antrean Dilewati",
};
export function serviceDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function groupFor(pax: number): "A" | "B" | "C" {
  return pax <= 2 ? "A" : pax <= 4 ? "B" : "C";
}
export function validateGuest(name: string, pax: number) {
  if (!name.trim() || name.trim().length > 60)
    throw new Error("Nama Tamu wajib diisi, maksimal 60 karakter.");
  if (!Number.isInteger(pax) || pax < 1 || pax > 12)
    throw new Error(
      "Jumlah Orang harus 1 sampai 12. Untuk rombongan lebih besar, hubungi staf.",
    );
}
export function activeQueue<T extends BoardEntry>(
  rows: T[],
  day = serviceDate(),
): T[] {
  return rows
    .filter(
      (r) => r.service_date === day && ["waiting", "called"].includes(r.status),
    )
    .sort(
      (a, b) =>
        a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
    );
}
// Within-category FIFO: a party of four does not block a table for two.
export function aheadCount(rows: BoardEntry[], ticket: BoardEntry) {
  return activeQueue(rows, ticket.service_date).filter(
    (r) =>
      r.group_code === ticket.group_code &&
      r.id !== ticket.id &&
      r.ticket_sequence < ticket.ticket_sequence,
  ).length;
}
export function canTransition(from: QueueStatus, to: QueueStatus) {
  return (
    (from === "waiting" && ["called", "no-show"].includes(to)) ||
    (from === "called" && ["seated", "no-show"].includes(to))
  );
}
// A new call must not hide earlier calls that staff have not resolved.
export function displayQueues<T extends BoardEntry>(rows: T[], day = serviceDate()) {
  const active = activeQueue(rows, day);
  const called = active.filter((r) => r.status === "called").sort(
    (a, b) => (b.called_at ?? "").localeCompare(a.called_at ?? "") || a.id.localeCompare(b.id),
  );
  return {
    current: called[0],
    previousCalls: called.slice(1),
    waiting: active.filter((r) => r.status === "waiting"),
  };
}
export function elapsed(iso: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
}
