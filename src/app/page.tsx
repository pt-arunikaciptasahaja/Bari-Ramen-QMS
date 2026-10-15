"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Clock3,
  Smartphone,
  Soup,
  Users,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { QueueForm } from "@/components/queue-form";
import { Card } from "@/components/ui/card";
import { DemoNotice } from "@/components/demo-notice";
import { useQueue } from "@/hooks/use-queue";
import { activeQueue } from "@/lib/queue";
export default function Home() {
  const router = useRouter();
  const queue = useQueue();
  const waiting = activeQueue(queue.rows).filter(
    (r) => r.status === "waiting",
  ).length;
  return (
    <>
      <DemoNotice />
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7">
        <Brand />
        <Link
          href="/staff"
          className="flex items-center gap-2 text-sm text-stone-500"
        >
          Area Staf <ArrowUpRight size={16} />
        </Link>
      </header>
      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20 lg:pt-16">
        <section>
          <p className="eyebrow mb-6 flex items-center gap-2 text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" /> ANTRE
            SEBENTAR, RAMEN SEBENTAR LAGI.
          </p>
          <h1 className="text-5xl font-extrabold leading-[1.08] tracking-[-.055em] sm:text-7xl">
            Ramen hangat.
            <br />
            <span className="font-serif font-normal italic text-brand">
              Tanpa ribet
            </span>
            <br />
            mengantre.
          </h1>
          <p className="mt-6 max-w-md text-base leading-7 text-stone-500">
            Ambil nomor antrean Anda di sini. Pantau giliran lewat ponsel, dan
            kami akan memanggil saat meja tersedia.
          </p>
          <div className="my-8 flex max-w-md items-center gap-4 rounded-xl border border-stone-200 bg-white/70 p-4">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#edf0e6] text-[#617347]">
              <Users size={21} />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {queue.loading
                  ? "Memuat antrean…"
                  : queue.error
                    ? "Antrean belum dapat dimuat"
                    : `${waiting} antrean sedang menunggu`}
              </p>
              <p className="mt-1 text-xs text-stone-500">
                {queue.error
                  ? "Periksa koneksi sebelum mendaftar."
                  : "Walk-in dan pendaftaran QR dalam satu antrean."}
              </p>
            </div>
          </div>
          <div className="flex gap-6 text-xs text-stone-500">
            <span className="flex items-center gap-2">
              <Check size={15} className="text-brand" /> Tidak perlu unduh
              aplikasi
            </span>
            <span className="flex items-center gap-2">
              <Smartphone size={15} className="text-brand" /> Pantau dari ponsel
            </span>
          </div>
        </section>
        <Card className="relative overflow-hidden p-6 sm:p-9">
          <div
            className="absolute right-[-20px] top-[-20px] text-stone-100"
            aria-hidden="true"
          >
            <Soup size={160} strokeWidth={1} />
          </div>
          <div className="relative">
            <p className="eyebrow mb-2 text-brand">SELAMAT DATANG DI BARI</p>
            <h2 className="text-2xl font-bold tracking-tight">
              Meja untuk berapa orang?
            </h2>
            <p className="mb-7 mt-2 text-sm leading-6 text-stone-500">
              Isi data singkat untuk mendapatkan nomor antrean.
            </p>
            <QueueForm onAdded={(entry) => router.push(`/q/${entry.id}`)} />
            <div className="mt-7 border-t border-dashed border-stone-200 pt-5 text-xs leading-6 text-stone-500">
              <Clock3 className="mr-2 inline" size={14} />
              Nomor berlaku hari ini. Tetap berada di sekitar restoran dan
              tunjukkan nomor saat dipanggil.
            </div>
          </div>
        </Card>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-4 border-t border-stone-200 px-6 py-6 text-xs text-stone-500">
        <span>BARI RAMEN · Dibuat untuk waktu yang lebih nikmat.</span>
        <Link href="/tv" className="flex items-center gap-1">
          Lihat layar antrean <ArrowUpRight size={13} />
        </Link>
      </footer>
    </>
  );
}
