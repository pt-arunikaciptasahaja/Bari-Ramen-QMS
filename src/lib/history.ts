import type { QueueEntry } from "./queue";

export type HistoryStatus = "all" | "seated" | "no-show";

export function queueHistory(rows: QueueEntry[], status: HistoryStatus, search = "") {
  const needle = search.trim().toLowerCase();
  return rows.filter((row) =>
    (row.status === "seated" || row.status === "no-show") &&
    (status === "all" || row.status === status) &&
    `${row.queue_number} ${row.customer_name}`.toLowerCase().includes(needle),
  ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export function dailySummary(rows: QueueEntry[]) {
  let seated = 0, seatedPax = 0, noShow = 0, online = 0, waitTotal = 0, calledCount = 0;
  for (const row of rows) {
    if (row.status === "seated") { seated++; seatedPax += row.pax; }
    if (row.status === "no-show") noShow++;
    if (row.source === "online") online++;
    if (row.called_at) {
      const wait = Date.parse(row.called_at) - Date.parse(row.created_at);
      if (Number.isFinite(wait) && wait >= 0) { waitTotal += wait; calledCount++; }
    }
  }
  return {
    total: rows.length, seated, seatedPax, noShow, online,
    walkIn: rows.length - online, calledCount,
    averageWaitMinutes: calledCount ? Math.round(waitTotal / calledCount / 60000) : null,
  };
}

// Quoting alone does not prevent spreadsheet formula injection.
export function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^\s*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function historyCsv(rows: QueueEntry[]) {
  const headers = ["Tanggal layanan", "Nomor", "Nama Tamu", "Jumlah Orang", "Asal", "Status", "Daftar (ISO UTC)", "Dipanggil (ISO UTC)", "Tunggu sampai dipanggil (menit)"];
  const records = rows.map((r) => [
    r.service_date, r.queue_number, r.customer_name, r.pax,
    r.source === "online" ? "QR Online" : "Walk-in",
    r.status === "seated" ? "Meja diberikan" : "Dilewati",
    r.created_at, r.called_at ?? "",
    r.called_at ? Math.max(0, Math.round((Date.parse(r.called_at) - Date.parse(r.created_at)) / 60000)) : "",
  ]);
  return "\uFEFF" + [headers, ...records].map((row) => row.map(csvCell).join(",")).join("\r\n");
}
