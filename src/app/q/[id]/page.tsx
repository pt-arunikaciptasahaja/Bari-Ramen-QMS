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
export default function TrackerPage({ params }: { params: Promise<{ id: string }> }) {
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
      <header className="mx-auto max-w-2xl px-6 py-7">
        <Brand />
      </header>
      <main className="mx-auto max-w-lg px-5 pb-12 pt-5">
        {loading ? (
          <p role="status" className="py-16 text-center text-stone-500">
            Memuat nomor antrean…
          </p>
        ) : !entry ? (
          <Card className="p-8 text-center">
            <h1 className="text-xl font-bold">
              {error ? "Antrean belum dapat dimuat" : "Antrean tidak ditemukan"}
            </h1>
            <p className="my-4 text-sm text-stone-500">
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
            <div className="mb-6 text-center">
              <p className="eyebrow mb-3 text-brand">
                {called
                  ? "GILIRAN ANDA SUDAH TIBA"
                  : "TEMPAT ANDA DALAM ANTREAN"}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                {called
                  ? "Meja Anda menanti."
                  : `Terima kasih, ${entry.customer_name}.`}
              </h1>
              <p className="mt-3 text-sm text-stone-500">
                {called
                  ? "Silakan ke kasir dan tunjukkan nomor berikut."
                  : "Simpan halaman ini untuk memantau giliran Anda."}
              </p>
            </div>
            <Card className="overflow-hidden">
              <div
                className={`px-7 py-9 text-center ${called ? "bg-[#e9efdf]" : "bg-[#f1eee5]"}`}
              >
                <p className="eyebrow text-stone-500">NOMOR ANTREAN ANDA</p>
                <p className="my-5 text-8xl font-extrabold tracking-[-.06em]">
                  {entry.queue_number}
                </p>
                <span
                  aria-live="polite"
                  className={`inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold ${called ? "text-emerald-800" : "text-stone-600"}`}
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
              <div className="relative border-t border-dashed border-stone-300 p-6">
                <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border-r border-stone-200 bg-paper" />
                <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border-l border-stone-200 bg-paper" />
                {entry.status === "waiting" && !expired && (
                  <div className="mb-6 rounded-xl bg-paper p-5 text-center">
                    <p aria-live="polite" className="text-3xl font-bold">
                      {board.loading || board.error ? "…" : ahead}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      antrean di depan Anda
                    </p>
                    <p className="mt-2 text-xs text-stone-500">
                      Dalam kelompok {entry.group_code}, sesuai jumlah orang.
                    </p>
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-stone-500">
                    <Users size={17} />
                    Jumlah Orang
                  </span>
                  <span className="font-semibold">{entry.pax} orang</span>
                </div>
                <div className="mt-4 flex justify-between text-sm">
                  <span className="text-stone-500">Tanggal antrean</span>
                  <span>{entry.service_date}</span>
                </div>
              </div>
            </Card>
            <p className="mt-6 text-center text-xs leading-6 text-stone-500">
              {expired
                ? "Nomor ini hanya berlaku pada tanggal pendaftaran."
                : entry.status === "no-show"
                  ? "Antrean Anda telah dilewati. Hubungi staf untuk bantuan."
                  : entry.status === "seated"
                    ? "Selamat menikmati ramen Anda."
                    : "Tetap di sekitar restoran. Urutan pemanggilan menyesuaikan kapasitas meja yang tersedia."}
            </p>
            <p className="mt-4 flex items-center justify-center gap-2 text-xs text-stone-500">
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
          className="mt-8 flex items-center justify-center gap-2 text-sm text-stone-500"
        >
          <ArrowLeft size={15} />
          Kembali ke beranda
        </Link>
      </main>
    </>
  );
}
