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
  MessageCircle,
  Search,
  Users,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { QueueForm } from "@/components/queue-form";
import { RegistrationQr } from "@/components/registration-qr";
import { PickupScreenSetup, TicketAccessTools } from "@/components/ticket-handoff";
import { QueueEditBadge, QueueRecoveryAction } from "@/components/queue-recovery";
import { QueueHistory } from "@/components/queue-history";
import { GroupBadge } from "@/components/group-badge";
import { groupCodes, queueGroups } from "@/lib/groups";
import { BARI_WHATSAPP, whatsappLink, whatsappMessage, whatsappState } from "@/lib/whatsapp";
import { StaffLogin } from "@/components/staff-login";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHead } from "@/components/ui/table";
import { useQueue } from "@/hooks/use-queue";
import { useStaff } from "@/hooks/use-staff";
import { callQueue, changeStatus } from "@/lib/api";
import {
  activeQueue,
  elapsed,
  type QueueEntry,
  type QueueStatus,
} from "@/lib/queue";
import { isDemo, supabase } from "@/lib/supabase";
const callTimeFormat = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
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
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function retryNotification(entry: QueueEntry) {
    if(lock.current || isDemo)return;
    lock.current=true;setPending(entry.id);setActionError('');
    try { await callQueue(entry.id,true); setMessage(`Pengiriman ulang notifikasi ${entry.queue_number} sedang diproses. Jumlah panggilan tetap sama.`); await queue.refresh(); }
    catch(e) {setActionError(e instanceof Error ? e.message : 'Notifikasi belum dapat diproses. Coba lagi.');}
    finally {lock.current=false;setPending(null);}
  }
  function openWhatsApp(entry: QueueEntry) {
    if (pending || queue.loading || queue.error) return;
    const latest = queue.rows.find((row) => row.id === entry.id);
    if (!latest) return;
    const href = whatsappLink(latest, Date.now());
    if (!href) return;
    if (!window.confirm(`Buka pesan untuk ${latest.customer_phone}?\n\n${whatsappMessage(latest)}\n\nGunakan akun WhatsApp restoran ${BARI_WHATSAPP}. Pastikan tamu bersedia dihubungi melalui WhatsApp. Anda masih perlu menekan Kirim di WhatsApp.`)) return;
    window.open(href, "_blank", "noopener,noreferrer");
    setMessage(`Silakan lanjutkan di WhatsApp untuk ${latest.queue_number}. Tekan Kirim di WhatsApp untuk mengirim pesan.`);
  }
  async function act(entry: QueueEntry, status: QueueStatus) {
    if (lock.current) return;
    if (
      status === "no-show" &&
      !window.confirm(
        `Lewati antrean ${entry.queue_number} atas nama ${entry.customer_name}? Tiket akan dipindahkan ke riwayat. Jika terjadi kesalahan, tiket dapat dikembalikan ke antrean hari ini.`,
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
        `${entry.queue_number} ${status === "called" ? "dipanggil" : status === "seated" ? "telah dikonfirmasi mendapat meja" : "dilewati"}.`,
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
      label: "Menunggu meja",
      value: active.filter((r) => r.status === "waiting").length,
      icon: Clock3,
      color: "bg-amber-50 text-amber-700",
    },
    {
      label: "Dipanggil",
      value: active.filter((r) => r.status === "called").length,
      icon: BellRing,
      color: "bg-blue-50 text-blue-700",
    },
    {
      label: "Rombongan mendapat meja",
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
          <Brand subtitle="Dashboard staf" />
          <div className="flex items-center gap-3">
            <Button asChild variant="outline">
              <Link href="/tv" target="_blank" rel="noreferrer">
                <ExternalLink size={16} />
                Layar antrean
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
                  Antrean tamu
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                  Daftarkan tamu, panggil giliran, dan konfirmasi pemberian meja.
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
                <Users size={18} className="text-brand" /> Daftarkan tamu
              </h2>
              <QueueForm
                onAdded={(entry) => {
                  setMessage(`${entry.queue_number} berhasil ditambahkan.`);
                  void queue.refresh();
                }}
              />
            </Card>
            <RegistrationQr />
            <PickupScreenSetup rows={active} onChanged={() => void queue.refresh()} />
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
                    ...groupCodes.map((code) => [code, `${code} · ${queueGroups[code].label}`]),
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setGroup(value)}
                      aria-pressed={group === value}
                      className={`min-h-10 rounded-lg px-3 text-xs font-semibold transition-colors duration-75 ${value !== "all" ? queueGroups[value as keyof typeof queueGroups].light : "bg-white text-ink"} ${group === value ? "ring-2 ring-inset ring-slate-600" : "hover:brightness-95"}`}
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
              <Table className="[&_td]:px-3 [&_th]:px-3">
                <thead className="bg-slate-50">
                  <tr>
                    <TableHead>Nomor</TableHead>
                    <TableHead>Nama tamu</TableHead>
                    <TableHead>Telepon / WhatsApp</TableHead>
                    <TableHead>Jumlah orang</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Aksi</TableHead>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const contact = whatsappState(entry, now);
                    const contactHelp = !contact.hasPhone ? "Nomor belum tersedia atau tidak valid" : entry.status !== "called" ? "Aktif 3 menit setelah panggilan pertama" : contact.enabled ? `Gunakan WhatsApp restoran ${BARI_WHATSAPP}` : contact.remaining === 0 ? "Menunggu pembaruan antrean" : `Aktif dalam ${String(Math.floor(contact.remaining / 60)).padStart(2, "0")}:${String(contact.remaining % 60).padStart(2, "0")}`;
                    return (
                    <tr
                      key={entry.id}
                      className={`border-t border-slate-100 ${entry.status === "called" ? "bg-blue-50/40" : ""}`}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-lg font-semibold tracking-normal tabular-nums">
                        <span className={`inline-flex rounded-md px-2 py-1 ${queueGroups[entry.group_code].light}`}>{entry.queue_number}</span>
                        <TicketAccessTools entry={entry} onChanged={() => void queue.refresh()} />
                        <QueueEditBadge entry={entry} />
                      </TableCell>
                      <TableCell className="min-w-[110px] font-semibold">
                        {entry.customer_name}
                        {entry.source === "online" && <p className="mt-1 text-xs font-normal text-slate-500">Daftar mandiri</p>}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-600">{entry.customer_phone || "-"}</span>
                          <div className="min-w-40">
                            <Button type="button" variant="outline" disabled={!contact.enabled || pending !== null || queue.loading || Boolean(queue.error)}
                              onClick={() => openWhatsApp(entry)} aria-label={`Buka WhatsApp untuk ${entry.queue_number}`}
                              className="min-h-10 whitespace-nowrap border-emerald-200 bg-emerald-50 px-3 text-xs text-emerald-800 hover:bg-emerald-100 disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-100">
                              <MessageCircle size={15} />Buka WhatsApp
                            </Button>
                            <p className="mt-1 whitespace-nowrap text-[11px] text-slate-500">{contactHelp}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <GroupBadge group={entry.group_code} pax={entry.pax} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`whitespace-nowrap text-xs font-semibold ${entry.status === "called" ? "text-blue-700" : "text-amber-700"}`}
                        >
                          {entry.status === "called" ? "Dipanggil" : "Menunggu"}
                        </span>
                        {entry.status === "waiting" && <p className="mt-1 whitespace-nowrap text-xs text-slate-500"><span className="font-mono tabular-nums">{now ? elapsed(entry.created_at, now) : 0}</span> menit</p>}
                        {entry.status === "called" && entry.called_at && (
                          <p className="mt-1 whitespace-nowrap font-mono text-xs tabular-nums text-slate-500">
                            Panggilan {entry.call_count ?? 1}/3 · {callTimeFormat.format(new Date(entry.called_at))} WIB
                          </p>
                        )}
                        {entry.status === 'called' && !isDemo && <div className="mt-2 text-[11px] leading-5 text-slate-500">
                          <p>{entry.push_status==='accepted'?'Notifikasi diproses layanan pengiriman':entry.push_status==='pending'?'Mengirim notifikasi…':entry.push_status==='failed'?'Notifikasi belum berhasil': 'Belum ada notifikasi untuk panggilan ini'}</p>
                          {entry.push_status && entry.push_status!=='accepted' && <button disabled={pending!==null} onClick={()=>void retryNotification(entry)} className="min-h-9 underline disabled:opacity-50">Coba kirim lagi</button>}
                        </div>}
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
                              {pending === entry.id ? "Memproses…" : "Berikan meja"}
                            </Button>
                          )}
                          <Button
                            disabled={pending !== null}
                            variant="destructive"
                            onClick={() => void act(entry, "no-show")}
                          >
                            <X size={17} />
                            Lewati antrean
                          </Button>
                        </div>
                        {entry.status==='called' && <div className="mt-2"><QueueRecoveryAction entry={entry} disabled={pending!==null||queue.loading||Boolean(queue.error)} onChanged={async restored=>{setMessage(restored.status==='waiting' ? `${restored.queue_number} kembali ke daftar menunggu. Riwayat perubahan disimpan.` : `Pemulihan ${restored.queue_number} sudah diproses sebelumnya. Periksa status terbaru.`);await queue.refresh();}}/></div>}
                      </TableCell>
                    </tr>
                  );})}
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
                      : "Pendaftaran mandiri dan pendaftaran melalui staf akan tampil di sini."}
                  </p>
                </div>
              )}
              <div className="border-t border-slate-100 px-6 py-4 text-xs text-slate-500">
                {active.length} antrean aktif · Urutan kedatangan dalam setiap
                kelompok jumlah orang. Pilih Berikan meja segera setelah meja diberikan kepada tamu. Notifikasi HP hanya dikirim kepada tamu yang sudah mengaktifkannya.
              </div>
            </Card>
            <QueueHistory todayRows={queue.rows} todayLoading={queue.loading} todayError={queue.error} onChanged={queue.refresh} />
          </>
        )}
      </main>
    </>
  );
}
