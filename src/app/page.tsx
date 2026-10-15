"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/brand";
import { QueueForm } from "@/components/queue-form";
import { DemoNotice } from "@/components/demo-notice";
import { useQueue } from "@/hooks/use-queue";
import { activeQueue } from "@/lib/queue";

export default function Home() {
  const router = useRouter();
  const queue = useQueue();
  const waiting = activeQueue(queue.rows).filter(
    (entry) => entry.status === "waiting",
  ).length;
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <DemoNotice />
      <header className="border-b border-stone-200 px-6 py-6">
        <div className="mx-auto max-w-5xl">
          <Brand />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-6 py-12 sm:py-16">
        <h1 className="text-2xl font-semibold tracking-tight">
          Daftar antrean
        </h1>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Isi nama dan jumlah orang. Nomor antrean akan ditampilkan setelah
          mendaftar.
        </p>
        <div className="my-7 border-y border-stone-200 py-4" role="status">
          <p className="text-sm">
            {queue.loading ? (
              "Memuat antrean…"
            ) : queue.error ? (
              "Antrean belum dapat dimuat."
            ) : (
              <>
                <span className="font-semibold tabular-nums">{waiting}</span>{" "}
                antrean menunggu
              </>
            )}
          </p>
          {queue.error && (
            <p className="mt-1 text-xs text-red-700">Periksa koneksi Anda.</p>
          )}
        </div>
        <QueueForm onAdded={(entry) => router.push(`/q/${entry.id}`)} />
        <p className="mt-5 text-xs leading-5 text-stone-500">
          Berlaku untuk hari ini. Tetap di sekitar restoran saat menunggu.
        </p>
      </main>
      <footer className="border-t border-stone-200 px-6 py-5">
        <div className="mx-auto flex max-w-5xl items-center justify-between text-xs text-stone-500">
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
