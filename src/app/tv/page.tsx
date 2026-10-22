"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Maximize, Volume2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { GroupBadge } from "@/components/group-badge";
import { groupCodes, queueGroups } from "@/lib/groups";
import { useQueue } from "@/hooks/use-queue";
import { displayQueues } from "@/lib/queue";
import { callAgeSeconds, carouselPage, collectReminders, rowsForHeight, warningLevel } from "@/lib/tv";

const urgencyClasses = {
  normal: "border-stone-200 bg-stone-50 text-stone-700",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  urgent: "border-rose-300 bg-rose-50 text-rose-900",
};
function duration(calledAt: string | null, now: number) {
  const age = callAgeSeconds(calledAt, now);
  return `${String(Math.floor(age / 60)).padStart(2, "0")}:${String(age % 60).padStart(2, "0")}`;
}
export default function TVPage() {
  const { rows, loading, error, connection } = useQueue();
  const [now, setNow] = useState(0);
  const [clock, setClock] = useState("");
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [flash, setFlash] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [capacity, setCapacity] = useState(10);
  const waitingArea = useRef<HTMLDivElement>(null);
  const seen = useRef<Map<string, string> | null>(null);
  const reminderSlots = useRef<Map<string, number> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const bell = useCallback(() => {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    [659.25, 523.25].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      const time = ctx.currentTime + index * 0.35;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.24, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
      oscillator.connect(gain); gain.connect(ctx.destination);
      oscillator.start(time); oscillator.stop(time + 0.75);
    });
  }, []);
  async function enableSound() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume(); setSound(true); setSoundError(""); bell();
    } catch { setSoundError("Suara tidak dapat diaktifkan. Periksa pengaturan browser."); }
  }
  useEffect(() => {
    const tick = () => {
      const value = Date.now(); setNow(value);
      setClock(new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(value));
    };
    tick();
    const timer = setInterval(tick, 1000);
    const carousel = setInterval(() => setRotation((value) => value + 1), 15000);
    const observer = new ResizeObserver(([entry]) => setCapacity(rowsForHeight(entry.contentRect.height)));
    if (waitingArea.current) observer.observe(waitingArea.current);
    return () => { clearInterval(timer); clearInterval(carousel); observer.disconnect(); void audio.current?.close(); audio.current = null; };
  }, []);
  useEffect(() => {
    if (loading || error) return;
    const next = new Map(rows.filter((row) => row.called_at).map((row) => [row.id, row.called_at!]));
    if (seen.current && rows.some((row) => row.status === "called" && row.called_at && seen.current?.get(row.id) !== row.called_at)) {
      setFlash((value) => value + 1); bell();
    }
    seen.current = next;
  }, [rows, loading, error, bell]);
  useEffect(() => {
    if (loading || error || !now) return;
    const result = collectReminders(rows, now, reminderSlots.current);
    reminderSlots.current = result.slots;
    if (result.shouldRing) { setFlash((value) => value + 1); bell(); }
  }, [rows, now, loading, error, bell]);

  const { current, previousCalls, waiting } = displayQueues(rows);
  const waitingPage = carouselPage(waiting, rotation, capacity);
  const previousPage = carouselPage(previousCalls, rotation, 4);
  const level = warningLevel(current?.called_at ?? null, now);
  return (
    <div className="flex min-h-dvh flex-col bg-paper text-ink sm:h-dvh sm:min-h-[540px] sm:overflow-hidden">
      <DemoNotice />
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-stone-200 bg-white/80 px-5 py-3 sm:flex-nowrap lg:px-8">
        <Brand size="large" subtitle="Selamat datang di Bari Ramen" />
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4">
          <span className="text-xs text-stone-600">{connection}</span>
          <span className="font-mono text-lg font-semibold tabular-nums sm:text-xl">{clock}</span>
          <button aria-label="Layar penuh" className="p-2 text-stone-600" onClick={() => {
            if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => setSoundError("Layar penuh tidak didukung browser ini."));
            else void document.exitFullscreen();
          }}><Maximize size={20} /></button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(230px,34%)] lg:gap-6 lg:p-6">
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div key={flash} className={`flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border border-stone-200 bg-white shadow-sm p-4 text-center transition-colors duration-75 ${flash ? "call-flash" : ""}`}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-terracotta lg:text-sm"><BellRing size={17} />{current ? "Nomor yang dipanggil" : "Selamat datang"}</p>
            <h1 aria-live="polite" className="my-3 whitespace-nowrap font-mono text-[clamp(3rem,10vw,10rem)] font-bold leading-none tabular-nums text-ink">{loading ? "…" : current?.queue_number ?? "-"}</h1>
            {current && <div className="mb-3"><GroupBadge group={current.group_code} pax={current.pax} /></div>}
            <p className="text-sm opacity-80 lg:text-lg">{current ? `Panggilan ${current.call_count ?? 1}/3 · Untuk ${current.pax} orang. Silakan menuju kasir.` : "Ambil nomor antrean melalui kode QR di restoran. Staf kami siap membantu di kasir."}</p>
            {current && <p className={`mt-3 rounded-lg border px-3 py-2 text-sm ${urgencyClasses[level]}`}><span className="font-mono tabular-nums">{duration(current.called_at, now)}</span> sejak panggilan pertama{level !== "normal" ? " · Silakan segera ke kasir" : ""}</p>}
          </div>
          {previousCalls.length > 0 && <section aria-labelledby="previous-calls-title" className="shrink-0 rounded-xl border border-stone-200 bg-white p-3">
            <div className="flex items-center justify-between text-xs text-stone-700">
              <h2 id="previous-calls-title" className="font-semibold">Nomor lain yang dipanggil</h2>
              {previousPage.pages > 1 && <span className="font-mono tabular-nums">{previousPage.page + 1}/{previousPage.pages}</span>}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {previousPage.items.map((entry) => <li key={entry.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${queueGroups[entry.group_code].light}`}>
                <span className="whitespace-nowrap font-mono text-xl font-semibold tabular-nums lg:text-3xl">{entry.queue_number}</span>
                <span className="text-right text-xs"><span className="font-mono tabular-nums">{entry.pax}</span> orang<br /><span className={`inline-block rounded-md border px-1.5 py-0.5 font-mono tabular-nums ${urgencyClasses[warningLevel(entry.called_at, now)]}`}>{duration(entry.called_at, now)}</span></span>
              </li>)}
            </ul>
            {previousPage.pages > 1 && <p className="mt-2 text-xs text-stone-600">Nomor yang dipanggil ditampilkan bergantian setiap 15 detik.</p>}
          </section>}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
            <span>Maksimal 3 panggilan dengan jeda 5 menit · Batas waktu 15 menit sejak panggilan pertama.</span>
            <button onClick={() => void enableSound()} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 ${sound ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-stone-300 bg-white text-stone-800"}`}><Volume2 size={16} />{sound ? "Suara aktif · Uji bel" : "Aktifkan suara"}</button>
          </div>
          {(error || soundError) && <p role="alert" className="shrink-0 rounded-lg bg-rose-50 p-2 text-xs text-rose-900">{error || soundError}</p>}
        </section>
        <aside className="flex min-h-[300px] flex-col rounded-xl border border-stone-200 bg-white shadow-sm px-4 py-3 sm:min-h-0">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-700">Menunggu giliran</h2>
            <span className="whitespace-nowrap font-mono text-xs tabular-nums text-stone-600">{waiting.length} antrean</span>
          </div>
          <div ref={waitingArea} className="min-h-0 flex-1 overflow-hidden">
            {waitingPage.items.length ? waitingPage.items.map((entry, index) => <div key={entry.id} className="flex h-12 items-center">
              <div className={`flex h-11 w-full items-center justify-between gap-2 rounded-md px-2 ${queueGroups[entry.group_code].light}`}>
              <span className="font-mono text-xs tabular-nums opacity-70">{String(waitingPage.offset + index + 1).padStart(2, "0")}</span>
              <span className="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums lg:text-3xl">{entry.queue_number}</span>
              <span className="whitespace-nowrap text-xs"><span className="font-mono tabular-nums">{entry.pax}</span> orang</span>
              </div>
            </div>) : <p className="py-8 text-center text-sm text-stone-600">{loading ? "Memuat antrean…" : "Belum ada rombongan yang menunggu."}</p>}
          </div>
          <div className="mt-2 shrink-0 border-t border-stone-200 pt-2 text-xs text-stone-600">
            <p>Halaman <span className="font-mono tabular-nums">{waitingPage.page + 1}/{waitingPage.pages}</span>{waitingPage.pages > 1 ? " · Berganti setiap 15 detik" : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="Warna kelompok antrean">{groupCodes.map((group) => <GroupBadge key={group} group={group} />)}</div>
          </div>
        </aside>
      </main>
      <footer className="shrink-0 px-5 pb-3 text-center text-xs text-stone-600">Terima kasih sudah menunggu. Silakan ke kasir saat nomor Anda dipanggil. Panggilan mengikuti ketersediaan meja sesuai jumlah orang.</footer>
    </div>
  );
}
