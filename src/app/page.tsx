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
    <div className="flex min-h-dvh flex-col bg-white">
      <DemoNotice />
      <header className="border-b border-slate-200 px-4 py-4">
        <div className="mx-auto max-w-5xl">
          <Brand />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 sm:py-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Antrean Bari Ramen
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Pendaftaran antrean dilakukan langsung di restoran melalui staf.
          Silakan ke kasir untuk mendapatkan nomor antrean.
        </p>
        <div
          className="my-5 rounded-lg bg-slate-100/50 px-3 py-3"
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
                antrean menunggu
              </>
            )}
          </p>
          {queue.error && (
            <p className="mt-1 text-xs text-red-700">Periksa koneksi Anda.</p>
          )}
        </div>
        <p className="text-sm leading-6 text-slate-600">
          Setelah mendaftar, scan QR tiket pada layar pelanggan untuk memantau
          giliran di HP. Nomor juga ditampilkan pada layar antrean restoran.
        </p>
        <Link href="/ticket" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-slate-100 px-4 text-sm font-semibold">Buka tiket saya</Link>
        <p className="mt-5 text-xs leading-5 text-slate-500">
          Berlaku untuk hari ini. Tetap di sekitar restoran saat menunggu.
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
