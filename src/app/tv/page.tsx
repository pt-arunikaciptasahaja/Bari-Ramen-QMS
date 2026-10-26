"use client";
import { useEffect, useRef, useState } from "react";
import { BellRing, Maximize, Volume2 } from "lucide-react";
import { TVSlideshow } from "@/components/tv-slideshow";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { queueGroups } from "@/lib/groups";
import { StaffLogin } from "@/components/staff-login";
import { useStaff } from "@/hooks/use-staff";
import { useTVAudio } from "@/hooks/use-tv-audio";
import { useQueue } from "@/hooks/use-queue";
import { displayQueues } from "@/lib/queue";
import { callAgeSeconds, carouselPage, collectReminders, rowsForHeight, warningLevel } from "@/lib/tv";

const urgencyClasses = {
  normal: "border-slate-200 bg-stone-50 text-slate-700",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  urgent: "border-rose-300 bg-rose-50 text-rose-900",
};
function duration(calledAt: string | null, now: number) {
  const age = callAgeSeconds(calledAt, now);
  return `${String(Math.floor(age / 60)).padStart(2, "0")}:${String(age % 60).padStart(2, "0")}`;
}
export default function TVPage() {
  const auth = useStaff();
  if (auth.ready && auth.allowed) return <TVDisplay />;
  return (
    <div className="min-h-dvh bg-white text-ink">
      <header className="border-b border-slate-200 px-5 py-4"><Brand homeLabel="Bari Ramen home" subtitle="Queue display · Staff access" /></header>
      <main className="mx-auto max-w-lg px-5 py-8">
        {!auth.ready ? <p role="status">Checking staff access…</p> : <>
          <p className="mb-5 text-center text-sm leading-6 text-slate-600">Sign in with a staff account to open the queue display on this device.</p>
          <StaffLogin language="en" />
          {auth.error && <p role="alert" className="mt-4 text-center text-sm text-red-700">{auth.error ? "Staff access could not be verified. Please sign in again." : ""}</p>}
        </>}
      </main>
    </div>
  );
}

// Mount the board, audio and subscriptions only after staff authorization.
function TVDisplay() {
  const { rows, loading, error, connection } = useQueue();
  const [now, setNow] = useState(0);
  const [clock, setClock] = useState("");
  const { status: soundStatus, ring: bell } = useTVAudio();
  const [displayError, setDisplayError] = useState("");
  const [flash, setFlash] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [capacity, setCapacity] = useState(10);
  const waitingArea = useRef<HTMLDivElement>(null);
  const seen = useRef<Map<string, string> | null>(null);
  const reminderSlots = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const tick = () => {
      const value = Date.now(); setNow(value);
      setClock(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(value));
    };
    tick();
    const timer = setInterval(tick, 1000);
    const carousel = setInterval(() => setRotation((value) => value + 1), 15000);
    const observer = new ResizeObserver(([entry]) => setCapacity(rowsForHeight(entry.contentRect.height) * (window.matchMedia("(min-width: 640px)").matches ? 2 : 1)));
    if (waitingArea.current) observer.observe(waitingArea.current);
    return () => { clearInterval(timer); clearInterval(carousel); observer.disconnect(); };
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
    <div className="tv-board" lang="en">
      <DemoNotice language="en" />
      <header className="tv-header">
        <Brand homeLabel="Bari Ramen home" size="large" subtitle="Today's queue" />
        <div className="flex items-center gap-3 sm:gap-5">
          <span className="text-xs text-slate-500">{error ? "Reconnecting…" : connection === "Terhubung" ? "Live" : connection === "Demo lokal" ? "Demo" : "Connecting…"}</span>
          <time className="font-mono text-xl font-semibold tabular-nums">{clock}</time>
          <button aria-label="Toggle fullscreen" className="p-2 text-slate-600" onClick={() => {
            if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => setDisplayError("Fullscreen is not available in this browser."));
            else void document.exitFullscreen().catch(() => setDisplayError("Could not exit fullscreen."));
          }}><Maximize size={20} /></button>
        </div>
      </header>
      <main className="tv-content">
        <section className="tv-queue-column" aria-label="Today's queue">
          <section key={flash} aria-labelledby="now-calling-title" className={`tv-current-call ${flash ? "call-flash" : ""}`}>
            <h1 id="now-calling-title" className="tv-section-label text-cobalt"><BellRing size={18} />{current ? "Now calling" : "Ready when you are"}</h1>
            <p aria-live="polite" className={`tv-call-number ${current ? "" : "tv-call-empty"}`}>{loading ? "…" : current?.queue_number ?? "Join the queue"}</p>
            {current ? <>
              <p className="tv-call-instruction">Please order at the cashier.</p>
              <div className="tv-call-details">
                <span>Call {current.call_count ?? 1} of 3</span><span className="tv-detail-dot" aria-hidden="true">·</span><span>Party of {current.pax}</span>
                <span className={`rounded-md border px-2 py-1 text-xs ${urgencyClasses[level]}`}><span className="font-mono tabular-nums">{duration(current.called_at, now)}</span> since first call</span>
              </div>
            </> : <p className="tv-call-instruction">Scan the QR code to join.<br /><span className="text-slate-500">Need a hand? Ask us at the cashier.</span></p>}
          </section>
          {previousCalls.length > 0 && <section aria-labelledby="previous-calls-title" className="tv-other-calls">
            <h2 id="previous-calls-title" className="tv-section-label">Also calling {previousPage.pages > 1 && <span className="font-mono font-normal">{previousPage.page + 1}/{previousPage.pages}</span>}</h2>
            <ul className="mt-2 grid grid-cols-2 gap-2">
              {previousPage.items.map(entry => <li key={entry.id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 ${queueGroups[entry.group_code].light}`}>
                <span className="whitespace-nowrap font-mono text-xl font-semibold tabular-nums">{entry.queue_number}</span>
                <span className="text-right text-xs">Party of {entry.pax}<br />Call {entry.call_count ?? 1} of 3</span>
              </li>)}
            </ul>
          </section>}
          <section className="tv-waiting" aria-labelledby="waiting-title">
            <div className="tv-waiting-heading">
              <h2 id="waiting-title" className="tv-section-label">Waiting list</h2>
              <span className="text-xs text-slate-500">{waiting.length} {waiting.length === 1 ? "party" : "parties"} waiting</span>
            </div>
            <div ref={waitingArea} className="tv-waiting-area">
              {waitingPage.items.length ? <ol className="tv-waiting-grid" start={waitingPage.offset + 1}>
                {waitingPage.items.map((entry,index) => <li key={entry.id} className={`tv-waiting-row ${queueGroups[entry.group_code].light}`}>
                  <span className="font-mono text-xs tabular-nums opacity-60">{String(waitingPage.offset+index+1).padStart(2,"0")}</span>
                  <span className="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums">{entry.queue_number}</span>
                  <span className="whitespace-nowrap text-xs">{entry.pax} {entry.pax === 1 ? "guest" : "guests"}</span>
                </li>)}
              </ol> : <p className="tv-waiting-empty">{loading ? "Loading the queue…" : "No parties waiting right now."}</p>}
            </div>
            <div className="tv-waiting-footer">
              <span>A · 1–2 guests <span aria-hidden="true">/</span> B · 3–5 <span aria-hidden="true">/</span> C · 6–12</span>
              {waitingPage.pages > 1 && <span>Page {waitingPage.page + 1} of {waitingPage.pages} · Updates every 15s</span>}
            </div>
          </section>
          <div className="tv-system-status">
            <span role="status" className="flex items-center gap-1.5"><Volume2 size={13} aria-hidden="true" />{soundStatus === "ready" ? "Sound on" : soundStatus === "blocked" ? "Tap the screen once to allow sound" : soundStatus === "unavailable" ? "Sound unavailable in this browser" : "Preparing sound…"}</span>
            {(error || displayError) && <span role="alert" className="text-rose-800">{displayError || "Connection interrupted. The queue will refresh automatically."}</span>}
          </div>
        </section>
        <aside className="tv-media-column" aria-label="Bari Ramen slideshow"><TVSlideshow /></aside>
      </main>
      <footer className="tv-footer">Please head to the cashier when your number is called. We call parties as suitable tables become available. <span>We’ll call up to three times, five minutes apart. Your place is released after 15 minutes if you haven’t checked in.</span></footer>
    </div>
  );
}
