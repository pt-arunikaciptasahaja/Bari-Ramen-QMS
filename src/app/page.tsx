"use client";

import Link from "next/link";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { useQueue } from "@/hooks/use-queue";
import { activeQueue } from "@/lib/queue";

export default function Home() {
  const queue = useQueue();
  const waiting = activeQueue(queue.rows).filter(
    (entry) => entry.status === "waiting",
  ).length;
  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <DemoNotice />
      <header className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <Brand />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 sm:py-8">
        <p className="eyebrow mb-3 text-cobalt">Selamat datang di Bari Ramen</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Semangkuk ramen, dimulai dari sini.
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Ambil nomor antrean, lalu nikmati waktu Anda sambil menunggu. Staf kami siap membantu di kasir.
        </p>
        <div
          className="my-5 rounded-lg border border-slate-200 bg-white px-3 py-3"
          role="status"
        >
          <p className="text-sm">
            {queue.loading ? (
              "Memuat antrean…"
            ) : queue.error ? (
              "Antrean belum dapat dimuat."
            ) : (
              <>
                <span className="font-mono font-semibold tabular-nums">
                  {waiting}
                </span>{" "}
                rombongan sedang menunggu
              </>
            )}
          </p>
          {queue.error && (
            <p className="mt-1 text-xs text-red-700">Periksa koneksi Anda.</p>
          )}
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Daftar melalui HP untuk mendapatkan tiket antrean. Jika Anda didaftarkan staf, pindai kode QR pada layar pengambilan tiket.
          Pantau tiket Anda dan aktifkan notifikasi agar tidak melewatkan giliran.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/register" className="inline-flex min-h-11 items-center rounded-md bg-brand px-4 text-sm font-semibold text-white">Daftar antrean</Link>
          <Link href="/ticket" className="inline-flex min-h-11 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold">Buka tiket saya</Link>
        </div>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Tiket berlaku pada hari pendaftaran. Tetap berada di sekitar restoran agar Anda dapat segera kembali saat dipanggil.
        </p>
      </main>
      <footer className="border-t border-slate-200 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-slate-500">
          <span>Bari Ramen</span>
          <nav className="flex gap-5" aria-label="Halaman operasional">
            <Link href="/staff" className="hover:text-ink">
              Staf
            </Link>
            <Link href="/tv" className="hover:text-ink">
              Layar antrean
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
