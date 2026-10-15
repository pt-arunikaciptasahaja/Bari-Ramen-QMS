"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BellRing, Maximize, Volume2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { useQueue } from "@/hooks/use-queue";
import { activeQueue } from "@/lib/queue";
export default function TVPage() {
  const { rows, loading, error, connection } = useQueue();
  const [origin, setOrigin] = useState("");
  const [clock, setClock] = useState("");
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState("");
  const [flash, setFlash] = useState(0);
  const seen = useRef<Map<string, string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  function bell() {
    const ctx = audio.current;
    if (!ctx || ctx.state !== "running") return;
    [659.25, 523.25].forEach((frequency, index) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      const time = ctx.currentTime + index * 0.35;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.24, time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(time);
      oscillator.stop(time + 0.75);
    });
  }
  async function enableSound() {
    try {
      audio.current ??= new AudioContext();
      await audio.current.resume();
      setSound(true);
      setSoundError("");
      bell();
    } catch {
      setSoundError(
        "Suara tidak dapat diaktifkan. Periksa pengaturan browser.",
      );
    }
  }
  useEffect(() => {
    setOrigin(window.location.origin);
    const tick = () =>
      setClock(
        new Intl.DateTimeFormat("id-ID", {
          timeZone: "Asia/Jakarta",
          hour: "2-digit",
          minute: "2-digit",
        }).format(new Date()),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    if (loading || error) return;
    const next = new Map(
      rows.filter((r) => r.called_at).map((r) => [r.id, r.called_at!]),
    );
    if (
      seen.current &&
      rows.some(
        (r) =>
          r.status === "called" &&
          r.called_at &&
          seen.current?.get(r.id) !== r.called_at,
      )
    ) {
      setFlash((n) => n + 1);
      bell();
    }
    seen.current = next;
  }, [rows, loading, error]);
  const active = activeQueue(rows);
  const called = active
    .filter((r) => r.status === "called")
    .sort((a, b) => (b.called_at ?? "").localeCompare(a.called_at ?? ""));
  const current = called[0];
  const waiting = active.filter((r) => r.status === "waiting").slice(0, 8);
  return (
    <div className="flex min-h-screen flex-col bg-[#171c18] text-white">
      <DemoNotice />
      <header className="flex flex-wrap items-center justify-between gap-5 border-b border-white/10 px-7 py-6 lg:px-12">
        <Brand dark />
        <div className="flex items-center gap-6">
          <span className="text-sm text-stone-400">{connection}</span>
          <span className="text-2xl font-semibold tabular-nums">{clock}</span>
          <button
            onClick={() => {
              if (!document.fullscreenElement)
                void document.documentElement
                  .requestFullscreen()
                  .catch(() =>
                    setSoundError("Layar penuh tidak didukung browser ini."),
                  );
              else void document.exitFullscreen();
            }}
            aria-label="Layar penuh"
            className="p-3 text-stone-400"
          >
            <Maximize size={21} />
          </button>
        </div>
      </header>
      <main className="grid flex-1 gap-7 p-6 lg:grid-cols-[1fr_350px] lg:p-10">
        <section className="flex flex-col gap-6">
          <div
            key={flash}
            className={`flex min-h-[430px] flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-[#252b26] p-8 text-center ${flash ? "call-flash" : ""}`}
          >
            <p className="eyebrow flex items-center gap-3 text-[#c2ccaa]">
              <BellRing size={19} /> SEDANG DIPANGGIL
            </p>
            <h1
              aria-live="polite"
              className="my-5 text-[clamp(5rem,14vw,12rem)] font-extrabold leading-none tracking-[-.05em] text-[#e6edcf]"
            >
              {loading ? "…" : (current?.queue_number ?? "—")}
            </h1>
            <p className="text-xl text-stone-300">
              {current
                ? `Untuk ${current.pax} orang · Silakan menuju kasir`
                : "Silakan ambil nomor antrean Anda"}
            </p>
            <p className="mt-4 text-sm text-stone-400">
              Terima kasih sudah menunggu. Ramen hangat segera menyambut Anda.
            </p>
          </div>
          {called.length > 1 && (
            <p className="text-sm text-stone-300">
              Masih dipanggil:{" "}
              {called
                .slice(1)
                .map((r) => r.queue_number)
                .join(" · ")}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-400">
            <span>
              A · 1–2 orang &nbsp; B · 3–4 orang &nbsp; C · 5–12 orang
            </span>
            <button
              onClick={() => void enableSound()}
              className={`flex min-h-12 items-center gap-2 rounded-xl border px-4 ${sound ? "border-emerald-800 text-emerald-300" : "border-amber-700 bg-amber-950/40 text-amber-200"}`}
            >
              <Volume2 size={17} />
              {sound ? "Suara aktif · Uji bel" : "Aktifkan suara"}
            </button>
          </div>
          {(error || soundError) && (
            <p
              role="alert"
              className="rounded-xl bg-red-950/60 p-3 text-sm text-red-200"
            >
              {error || soundError}
            </p>
          )}
        </section>
        <aside className="flex flex-col rounded-3xl border border-white/10 bg-[#1e241f] p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="eyebrow text-stone-300">SELANJUTNYA</h2>
            <span className="rounded-md bg-white/5 px-2 py-1 text-xs text-stone-400">
              {active.filter((r) => r.status === "waiting").length} menunggu
            </span>
          </div>
          <div className="flex-1">
            {waiting.length ? (
              waiting.map((entry, i) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b border-white/10 py-4"
                >
                  <span className="text-xs text-stone-500">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-3xl font-bold tracking-tight">
                    {entry.queue_number}
                  </span>
                  <span className="text-sm text-stone-400">
                    {entry.pax} orang
                  </span>
                </div>
              ))
            ) : (
              <p className="py-10 text-center text-sm text-stone-400">
                {loading ? "Memuat antrean…" : "Belum ada antrean menunggu."}
              </p>
            )}
          </div>
          <div className="mt-8 flex items-center gap-4 rounded-2xl bg-[#e6edcf] p-4 text-[#252b26]">
            {origin && (
              <QRCodeSVG
                value={origin}
                size={82}
                bgColor="#e6edcf"
                fgColor="#252b26"
                marginSize={1}
              />
            )}
            <div>
              <h3 className="text-sm font-bold">Belum ambil nomor?</h3>
              <p className="mt-1 text-xs leading-5">
                Pindai QR untuk bergabung dalam antrean.
              </p>
            </div>
          </div>
        </aside>
      </main>
      <footer className="px-10 pb-6 text-center text-xs text-stone-500">
        Urutan dipanggil menyesuaikan kapasitas meja tersedia. Nomor antrean
        berlaku hari ini.
      </footer>
    </div>
  );
}
