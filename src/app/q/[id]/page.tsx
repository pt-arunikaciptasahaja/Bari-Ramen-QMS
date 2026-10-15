"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useState } from "react";
import { ArrowLeft, BellRing, Check, Clock3, Users } from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { Card } from "@/components/ui/card";
import { useQueue } from "@/hooks/use-queue";
import { fetchTicket } from "@/lib/api";
import {
  aheadCount,
  serviceDate,
  statusLabel,
  type QueueEntry,
} from "@/lib/queue";
export default function TrackerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const board = useQueue();
  const [ticket, setTicket] = useState<QueueEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [today, setToday] = useState("");
  const load = useCallback(async () => {
    try {
      const row = await fetchTicket(id);
      setTicket(row);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Tidak dapat memuat nomor antrean.",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    let alive = true;
    // Keep stale responses from a previous route out of this tracker.
    async function initial() {
      setLoading(true);
      try {
        const row = await fetchTicket(id);
        if (alive) {
          setTicket(row);
          setError("");
        }
      } catch (e) {
        if (alive)
          setError(
            e instanceof Error ? e.message : "Tidak dapat memuat antrean.",
          );
      } finally {
        if (alive) setLoading(false);
      }
    }
    void initial();
    setToday(serviceDate());
    const timer = setInterval(() => {
      if (alive) {
        setToday(serviceDate());
        void load();
      }
    }, 15000);
    const focus = () => {
      if (alive) void load();
    };
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [id, load]);
  // The public projection contains status changes, but never guest names.
  const live = board.rows.find((r) => r.id === id);
  const entry = ticket
    ? {
        ...ticket,
        ...(live ? { status: live.status, called_at: live.called_at } : {}),
      }
    : null;
  const expired = entry && today && entry.service_date !== today;
  const called = entry?.status === "called" && !expired;
  const ahead = entry ? aheadCount(board.rows, entry) : 0;
  return (
    <>
      <DemoNotice />
      <header className="mx-auto w-full max-w-md px-4 py-4">
        <Brand />
      </header>
      <main className="mx-auto w-full max-w-md px-4 pb-6 pt-2">
        {loading ? (
          <p role="status" className="py-16 text-center text-slate-500">
            Memuat nomor antrean…
          </p>
        ) : !entry ? (
          <Card className="p-5 text-center">
            <h1 className="text-xl font-bold">
              {error ? "Antrean belum dapat dimuat" : "Antrean tidak ditemukan"}
            </h1>
            <p className="my-4 text-sm text-slate-500">
              {error ||
                "Buka tautan ini dari browser yang digunakan saat mengambil antrean."}
            </p>
            <button
              onClick={() => void load()}
              className="text-sm font-semibold text-brand underline"
            >
              Coba lagi
            </button>
          </Card>
        ) : (
          <>
            <div className="mb-4">
              <h1 className="text-xl font-semibold">
                {called ? "Silakan ke kasir" : "Antrean Anda"}
              </h1>
              <p className="mt-1 text-sm font-medium">{entry.customer_name}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {called
                  ? "Silakan ke kasir dan tunjukkan nomor berikut."
                  : "Simpan halaman ini untuk memantau giliran Anda."}
              </p>
            </div>
            <Card className="overflow-hidden">
              <div
                className={`px-4 py-5 text-center ${called ? "bg-amber-50" : "bg-slate-100/50"}`}
              >
                <p className="text-xs font-medium text-slate-500">
                  Nomor antrean
                </p>
                <p className="my-3 whitespace-nowrap font-mono text-[clamp(2rem,10vw,3.5rem)] font-semibold leading-tight tracking-normal tabular-nums">
                  {entry.queue_number}
                </p>
                <span
                  aria-live="polite"
                  className={`inline-flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-xs font-medium ${expired || entry.status === "no-show" ? "text-rose-600" : called ? "text-amber-600" : entry.status === "seated" ? "text-emerald-600" : "text-slate-600"}`}
                >
                  {called ? (
                    <BellRing size={16} />
                  ) : entry.status === "seated" ? (
                    <Check size={16} />
                  ) : (
                    <Clock3 size={16} />
                  )}
                  {expired
                    ? "Antrean sudah berakhir"
                    : statusLabel[entry.status]}
                </span>
              </div>
              <div className="p-4">
                {entry.status === "waiting" && !expired && (
                  <div className="mb-4 rounded-lg bg-slate-100/50 px-3 py-3">
                    <p aria-live="polite" className="text-sm">
                      <span className="font-mono font-semibold tabular-nums">
                        {board.loading || board.error ? "…" : ahead}
                      </span>{" "}
                      antrean di depan Anda
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Kelompok {entry.group_code}, sesuai jumlah orang.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Users size={17} />
                    Jumlah Orang
                  </span>
                  <span>
                    <span className="font-mono font-medium tabular-nums">
                      {entry.pax}
                    </span>{" "}
                    orang
                  </span>
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className="text-slate-500">Tanggal antrean</span>
                  <span className="font-mono text-xs tabular-nums">
                    {entry.service_date}
                  </span>
                </div>
              </div>
            </Card>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              {expired
                ? "Nomor ini hanya berlaku pada tanggal pendaftaran."
                : entry.status === "no-show"
                  ? "Antrean Anda telah dilewati. Hubungi staf untuk bantuan."
                  : entry.status === "seated"
                    ? "Meja sudah diberikan."
                    : "Tetap di sekitar restoran. Urutan pemanggilan menyesuaikan kapasitas meja yang tersedia."}
            </p>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              {board.connection} · Halaman diperbarui otomatis
            </p>
          </>
        )}
        {(error || board.error) && entry && (
          <p role="alert" className="mt-4 text-center text-sm text-red-700">
            {error || board.error} Data mungkin belum terbaru.
          </p>
        )}
        <Link
          href="/"
          className="mt-5 flex min-h-11 items-center justify-center gap-2 text-sm text-slate-500 transition-colors duration-75 ease-in-out hover:text-slate-900"
        >
          <ArrowLeft size={15} />
          Kembali ke beranda
        </Link>
      </main>
    </>
  );
}
