"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BellRing,
  Check,
  CheckCheck,
  Clock3,
  ExternalLink,
  ListOrdered,
  LogOut,
  Search,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { QueueForm } from "@/components/queue-form";
import { QueueHistory } from "@/components/queue-history";
import { StaffLogin } from "@/components/staff-login";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { useQueue } from "@/hooks/use-queue";
import { useStaff } from "@/hooks/use-staff";
import { changeStatus } from "@/lib/api";
import {
  activeQueue,
  elapsed,
  type QueueEntry,
  type QueueStatus,
} from "@/lib/queue";
import { isDemo, supabase } from "@/lib/supabase";
export default function StaffPage() {
  const auth = useStaff();
  const queue = useQueue(true, auth.allowed);
  const [group, setGroup] = useState("all");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  async function act(entry: QueueEntry, status: QueueStatus) {
    if (lock.current) return;
    if (
      status === "no-show" &&
      !window.confirm(
        `Lewati antrean ${entry.queue_number} atas nama ${entry.customer_name}?`,
      )
    )
      return;
    lock.current = true;
    setPending(entry.id);
    setActionError("");
    setMessage("");
    try {
      await changeStatus(entry.id, status);
      setMessage(
        `${entry.queue_number} ${status === "called" ? "dipanggil" : status === "seated" ? "selesai, meja diberikan" : "dilewati"}.`,
      );
      await queue.refresh();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Tidak dapat mengubah antrean.",
      );
      await queue.refresh();
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  const active = activeQueue(queue.rows);
  const filtered = active.filter(
    (r) =>
      (group === "all" || r.group_code === group) &&
      `${r.customer_name} ${r.queue_number}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const stats = [
    {
      label: "Menunggu",
      value: active.filter((r) => r.status === "waiting").length,
      icon: Clock3,
      color: "bg-amber-50 text-amber-700",
    },
    {
      label: "Sedang dipanggil",
      value: active.filter((r) => r.status === "called").length,
      icon: BellRing,
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Sudah mendapat meja",
      value: queue.rows.filter((r) => r.status === "seated").length,
      icon: CheckCheck,
      color: "bg-emerald-50 text-emerald-700",
    },
  ];
  return (
    <>
      <DemoNotice />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <Brand />
          <div className="flex items-center gap-3">
            <span className="hidden rounded-lg bg-paper px-3 py-2 text-xs text-slate-500 sm:block">
              PENGELOLA ANTREAN
            </span>
            <Button asChild variant="outline">
              <Link href="/tv" target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                Layar TV
              </Link>
            </Button>
            {auth.allowed && !isDemo && (
              <Button
                aria-label="Keluar"
                variant="ghost"
                onClick={async () => {
                  try {
                    await supabase().auth.signOut();
                  } catch {
                    setActionError("Tidak dapat keluar.");
                  }
                }}
              >
                <LogOut size={17} />
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        {!auth.ready ? (
          <p role="status">Memeriksa akses staf…</p>
        ) : !auth.allowed ? (
          <>
            <StaffLogin />
            {auth.error && (
              <p role="alert" className="mt-4 text-center text-red-700">
                {auth.error}
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="eyebrow mb-2 text-brand">OPERASIONAL HARI INI</p>
                <h1 className="text-3xl font-bold tracking-tight">
                  Antrean Tamu
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  Kelola antrean walk-in dan online.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span
                  className={`h-2 w-2 rounded-full ${queue.connection === "Menghubungkan ulang" ? "bg-amber-500" : "bg-emerald-600"}`}
                />
                {queue.connection}
              </div>
            </div>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              {stats.map((s) => (
                <Card key={s.label} className="flex items-center gap-4 p-5">
                  <span
                    className={`grid h-12 w-12 place-items-center rounded-xl ${s.color}`}
                  >
                    <s.icon size={23} />
                  </span>
                  <div>
                    <p className="text-xs text-slate-500">{s.label}</p>
                    <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
                      {queue.loading ? "…" : s.value}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
            <Card className="mb-7 p-5 sm:p-6">
              <h2 className="mb-5 flex items-center gap-2 text-base font-bold">
                <Users size={18} className="text-brand" /> Tambahkan tamu
                walk-in
              </h2>
              <QueueForm
                staff
                onAdded={(entry) => {
                  setMessage(`${entry.queue_number} berhasil ditambahkan.`);
                  void queue.refresh();
                }}
              />
            </Card>
            <div aria-live="polite" className="mb-3 text-sm text-emerald-800">
              {message}
            </div>
            {(actionError || queue.error) && (
              <div
                role="alert"
                className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800"
              >
                {actionError || queue.error}
                <button
                  onClick={() => void queue.refresh()}
                  className="ml-3 underline"
                >
                  Coba lagi
                </button>
              </div>
            )}
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-5">
                <div className="flex flex-wrap gap-1 rounded-xl bg-paper p-1">
                  {[
                    ["all", "Semua"],
                    ["A", "A · 1–2 orang"],
                    ["B", "B · 3–4 orang"],
                    ["C", "C · 5–12 orang"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setGroup(value)}
                      aria-pressed={group === value}
                      className={`min-h-10 rounded-lg px-3 text-xs font-semibold ${group === value ? "bg-white text-ink shadow-sm" : "text-slate-500"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    aria-label="Cari nama atau nomor"
                    placeholder="Cari nama / nomor"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-10 rounded-lg border border-slate-200 pl-9 pr-3 text-sm"
                  />
                </div>
              </div>
              <Table>
                <thead className="bg-slate-50">
                  <tr>
                    <TableHead>Nomor</TableHead>
                    <TableHead>Nama Tamu</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Asal</TableHead>
                    <TableHead>Menunggu</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-t border-slate-100 ${entry.status === "called" ? "bg-blue-50/40" : ""}`}
                    >
                      <TableCell className="font-mono text-lg font-semibold tracking-normal tabular-nums">
                        {entry.queue_number}
                      </TableCell>
                      <TableCell className="min-w-[140px] font-semibold">
                        {entry.customer_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-mono tabular-nums">
                          {entry.pax}
                        </span>{" "}
                        orang
                      </TableCell>
                      <TableCell>
                        <span
                          className="whitespace-nowrap rounded-md bg-slate-100/50 px-2 py-1 text-xs text-slate-600"
                        >
                          {entry.source === "online" ? "QR Online" : "Walk-in"}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-slate-500">
                        <span className="font-mono tabular-nums">
                          {now ? elapsed(entry.created_at, now) : 0}
                        </span>{" "}
                        menit
                      </TableCell>
                      <TableCell>
                        <span
                          className={`whitespace-nowrap text-xs font-semibold ${entry.status === "called" ? "text-blue-700" : "text-amber-700"}`}
                        >
                          {entry.status === "called" ? "Dipanggil" : "Menunggu"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {entry.status === "waiting" ? (
                            <Button
                              disabled={pending !== null}
                              variant="call"
                              onClick={() => void act(entry, "called")}
                            >
                              <BellRing size={17} />
                              {pending === entry.id ? "Memproses…" : "Panggil"}
                            </Button>
                          ) : (
                            <Button
                              disabled={pending !== null}
                              variant="success"
                              onClick={() => void act(entry, "seated")}
                            >
                              <Check size={18} />
                              {pending === entry.id ? "Memproses…" : "Selesai"}
                            </Button>
                          )}
                          <Button
                            disabled={pending !== null}
                            variant="destructive"
                            onClick={() => void act(entry, "no-show")}
                          >
                            <X size={17} />
                            Lewati
                          </Button>
                        </div>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {!filtered.length && (
                <div className="grid place-items-center gap-3 p-14 text-center">
                  <ListOrdered className="text-slate-300" size={38} />
                  <p className="font-semibold">
                    {queue.loading
                      ? "Memuat antrean…"
                      : search
                        ? "Tamu tidak ditemukan"
                        : "Belum ada antrean aktif"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {search
                      ? "Coba nama atau nomor lainnya."
                      : "Tamu walk-in dan QR akan muncul di sini."}
                  </p>
                </div>
              )}
              <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
                {active.length} antrean aktif · Urutan kedatangan dalam setiap
                kelompok jumlah orang. Selesai = meja sudah diberikan.
              </div>
            </Card>
            <QueueHistory todayRows={queue.rows} todayLoading={queue.loading} todayError={queue.error} />
          </>
        )}
      </main>
    </>
  );
}
