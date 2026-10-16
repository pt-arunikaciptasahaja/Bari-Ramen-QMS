"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Maximize, Volume2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { useQueue } from "@/hooks/use-queue";
import { displayQueues } from "@/lib/queue";
import { callAgeSeconds, carouselPage, collectReminders, rowsForHeight, warningLevel } from "@/lib/tv";

const urgencyClasses = {
  normal: "border-white/10 bg-[#181818] text-white",
  warning: "border-amber-500/60 bg-amber-950/50 text-amber-200",
  urgent: "border-rose-500/70 bg-rose-950/60 text-rose-200",
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
    <div className="flex min-h-dvh flex-col bg-[#101010] text-white sm:h-dvh sm:min-h-[540px] sm:overflow-hidden">
      <DemoNotice />
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3 lg:px-8">
        <Brand dark />
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">{connection}</span>
          <span className="font-mono text-xl font-semibold tabular-nums">{clock}</span>
          <button aria-label="Layar penuh" className="p-2 text-slate-400" onClick={() => {
            if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => setSoundError("Layar penuh tidak didukung browser ini."));
            else void document.exitFullscreen();
          }}><Maximize size={20} /></button>
        </div>
      </header>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(230px,34%)] lg:gap-6 lg:p-6">
        <section className="flex min-h-0 min-w-0 flex-col gap-3">
          <div key={flash} className={`flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl border p-4 text-center transition-colors duration-75 ${urgencyClasses[level]} ${flash ? "call-flash" : ""}`}>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-70"><BellRing size={17} />Panggilan terbaru</p>
            <h1 aria-live="polite" className="my-3 whitespace-nowrap font-mono text-[clamp(2rem,9vw,8rem)] font-semibold leading-none tabular-nums">{loading ? "…" : current?.queue_number ?? "-"}</h1>
            <p className="text-sm opacity-80 lg:text-lg">{current ? `Untuk ${current.pax} orang. Silakan menuju kasir.` : "Pendaftaran antrean melalui staf di restoran."}</p>
            {current && <p className="mt-3 text-sm"><span className="font-mono tabular-nums">{duration(current.called_at, now)}</span> sejak dipanggil{level !== "normal" ? " · Menunggu kedatangan tamu" : ""}</p>}
          </div>
          {previousCalls.length > 0 && <section aria-labelledby="previous-calls-title" className="shrink-0 rounded-xl bg-white/5 p-3">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <h2 id="previous-calls-title" className="font-semibold">Masih dipanggil</h2>
              {previousPage.pages > 1 && <span className="font-mono tabular-nums">{previousPage.page + 1}/{previousPage.pages}</span>}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {previousPage.items.map((entry) => <li key={entry.id} className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${urgencyClasses[warningLevel(entry.called_at, now)]}`}>
                <span className="whitespace-nowrap font-mono text-xl font-semibold tabular-nums lg:text-3xl">{entry.queue_number}</span>
                <span className="text-right text-xs opacity-80"><span className="font-mono tabular-nums">{entry.pax}</span> orang<br /><span className="font-mono tabular-nums">{duration(entry.called_at, now)}</span></span>
              </li>)}
            </ul>
            {previousPage.pages > 1 && <p className="mt-2 text-xs text-slate-400">Semua panggilan bergantian tampil setiap 15 detik.</p>}
          </section>}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
            <span>Pengingat setiap 1 menit sampai diselesaikan staf.</span>
            <button onClick={() => void enableSound()} className={`flex min-h-10 items-center gap-2 rounded-lg border px-3 ${sound ? "border-emerald-800 text-emerald-300" : "border-amber-700 text-amber-200"}`}><Volume2 size={16} />{sound ? "Suara aktif · Uji bel" : "Aktifkan suara"}</button>
          </div>
          {(error || soundError) && <p role="alert" className="shrink-0 rounded-lg bg-rose-950/60 p-2 text-xs text-rose-200">{error || soundError}</p>}
        </section>
        <aside className="flex min-h-[300px] flex-col rounded-xl border border-white/10 bg-[#181818] px-4 py-3 sm:min-h-0">
          <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-300">Menunggu</h2>
            <span className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-400">{waiting.length} antrean</span>
          </div>
          <div ref={waitingArea} className="min-h-0 flex-1 overflow-hidden">
            {waitingPage.items.length ? waitingPage.items.map((entry, index) => <div key={entry.id} className="flex h-12 items-center justify-between gap-2 border-b border-white/10">
              <span className="font-mono text-xs tabular-nums text-slate-500">{String(waitingPage.offset + index + 1).padStart(2, "0")}</span>
              <span className="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums lg:text-3xl">{entry.queue_number}</span>
              <span className="whitespace-nowrap text-xs text-slate-400"><span className="font-mono tabular-nums">{entry.pax}</span> orang</span>
            </div>) : <p className="py-8 text-center text-sm text-slate-400">{loading ? "Memuat antrean..." : "Belum ada antrean menunggu."}</p>}
          </div>
          <div className="mt-2 shrink-0 border-t border-white/10 pt-2 text-xs text-slate-400">
            <p>Halaman <span className="font-mono tabular-nums">{waitingPage.page + 1}/{waitingPage.pages}</span>{waitingPage.pages > 1 ? " · Berganti setiap 15 detik" : ""}</p>
            <p className="mt-1">A: 1-2 · B: 3-4 · C: 5-12 orang</p>
          </div>
        </aside>
      </main>
      <footer className="shrink-0 px-5 pb-3 text-center text-xs text-slate-500">Kuning: 1 menit · Merah: 3 menit. Nomor tetap aktif sampai staf menekan Selesai atau Lewati.</footer>
    </div>
  );
}
