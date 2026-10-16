"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useQueue } from "@/hooks/use-queue";
import { serviceDate, type QueueEntry } from "@/lib/queue";
import { dailySummary, historyCsv, queueHistory, type HistoryStatus } from "@/lib/history";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Table, TableCell, TableHead } from "./ui/table";
import { GroupBadge } from "./group-badge";
import { queueGroups } from "@/lib/groups";

const PAGE_SIZE = 20;
const timeFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
function time(value: string | null) { return value ? timeFormat.format(new Date(value)) : "-"; }

export function QueueHistory({ todayRows, todayLoading, todayError }: {
  todayRows: QueueEntry[]; todayLoading: boolean; todayError: string;
}) {
  const today = serviceDate();
  const [date, setDate] = useState(today);
  const [status, setStatus] = useState<HistoryStatus>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const archived = useQueue(true, date !== today, date);
  const rows = date === today ? todayRows : archived.rows;
  const loading = date === today ? todayLoading : archived.loading;
  const error = date === today ? todayError : archived.error;
  const summary = useMemo(() => dailySummary(rows), [rows]);
  const history = useMemo(() => queueHistory(rows, status, search), [rows, status, search]);
  const lastPage = Math.max(0, Math.ceil(history.length / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = history.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const unavailable = loading || Boolean(error);

  function exportCsv() {
    if (unavailable || !history.length) return;
    const url = URL.createObjectURL(new Blob([historyCsv(history)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url; link.download = `bari-ramen-riwayat-${date}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section aria-labelledby="history-title" className="mt-10">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="history-title" className="text-xl font-bold">Riwayat dan rekap harian</h2>
          <p className="mt-1 text-sm text-slate-500">Antrean yang sudah mendapat meja atau dilewati tetap tersimpan.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="history-date" className="mb-1 block text-xs font-semibold">Tanggal antrean</label>
            <input id="history-date" type="date" value={date} max={today} required
              onChange={(e) => { const day = e.target.value; if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day <= today) { setDate(day); setPage(0); } }}
              className="min-h-12 rounded-md border border-slate-200 bg-white px-3 font-mono text-sm tabular-nums" />
          </div>
          <Button variant="outline" disabled={unavailable || !history.length} onClick={exportCsv}><Download size={16} />Unduh CSV</Button>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 text-sm text-rose-700">Rekap belum dapat dimuat. {error}</p>}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5" aria-busy={loading}>
        {[
          ["Total pendaftaran", summary.total], ["Sudah mendapat meja", summary.seated],
          ["Orang mendapat meja", summary.seatedPax], ["Dilewati", summary.noShow],
          ["Rata-rata tunggu (menit)", summary.averageWaitMinutes ?? "-"],
        ].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-100/70 px-4 py-3">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{unavailable ? "-" : value}</p>
        </div>)}
      </div>
      <p className="mb-4 text-xs leading-5 text-slate-500">
        Rekap berdasarkan tanggal pendaftaran (WIB), termasuk antrean aktif. Waktu tunggu dihitung dari daftar sampai dipanggil, hanya untuk tiket yang pernah dipanggil.
        {!unavailable && <> QR Online: <span className="font-mono tabular-nums">{summary.online}</span>. Walk-in: <span className="font-mono tabular-nums">{summary.walkIn}</span>.</>}
      </p>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filter status riwayat">
            {([["all", "Semua riwayat"], ["seated", "Selesai"], ["no-show", "Dilewati"]] as const).map(([value, label]) =>
              <button key={value} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}
                className={`min-h-11 rounded-md px-3 text-sm font-medium transition-colors duration-75 ${status === value ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>)}
          </div>
          <input aria-label="Cari riwayat nama atau nomor" placeholder="Cari nama / nomor" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="min-h-11 rounded-md border border-slate-200 px-3 text-sm" />
        </div>
        <Table>
          <thead className="bg-slate-50"><tr>{["Nomor", "Nama Tamu", "Telepon / WhatsApp", "Jumlah", "Asal", "Daftar (WIB)", "Dipanggil (WIB)", "Status"].map((label) => <TableHead key={label}>{label}</TableHead>)}</tr></thead>
          <tbody>{!unavailable && visible.map((entry) => <tr key={entry.id} className="border-t border-slate-100 hover:bg-slate-50">
            <TableCell className="whitespace-nowrap font-mono font-semibold tabular-nums"><span className={`rounded-md px-2 py-1 ${queueGroups[entry.group_code].light}`}>{entry.queue_number}</span></TableCell>
            <TableCell className="min-w-36 font-medium">{entry.customer_name}</TableCell>
            <TableCell className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-500">{entry.customer_phone || "-"}</TableCell>
            <TableCell><GroupBadge group={entry.group_code} pax={entry.pax} /></TableCell>
            <TableCell className="whitespace-nowrap text-slate-500">{entry.source === "online" ? "QR Online" : "Walk-in"}</TableCell>
            <TableCell className="font-mono tabular-nums">{time(entry.created_at)}</TableCell>
            <TableCell className="font-mono tabular-nums">{time(entry.called_at)}</TableCell>
            <TableCell><span className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold ${entry.status === "seated" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{entry.status === "seated" ? "Meja diberikan" : "Dilewati"}</span></TableCell>
          </tr>)}</tbody>
        </Table>
        {(unavailable || !history.length) && <p role="status" className="px-5 py-8 text-center text-sm text-slate-500">{loading ? "Memuat riwayat..." : error ? "Riwayat belum tersedia. Coba lagi setelah koneksi pulih." : "Belum ada riwayat yang sesuai filter."}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span><span className="font-mono tabular-nums">{unavailable ? "-" : history.length}</span> hasil. CSV mengikuti tanggal, status, dan pencarian. Selesai berarti meja diberikan, bukan transaksi lunas.</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" className="min-h-10 px-2 text-xs" disabled={unavailable || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Sebelumnya</Button>
            <span className="whitespace-nowrap font-mono tabular-nums">{currentPage + 1} / {lastPage + 1}</span>
            <Button variant="ghost" className="min-h-10 px-2 text-xs" disabled={unavailable || currentPage >= lastPage} onClick={() => setPage(currentPage + 1)}>Berikutnya</Button>
          </div>
        </div>
      </Card>
    </section>
  );
}
