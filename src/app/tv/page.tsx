"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize } from "lucide-react";
import { formatJakartaClock } from "@/lib/jakarta-clock";
import { TVSlideshow } from "@/components/tv-slideshow";
import { Brand } from "@/components/brand";
import { DemoNotice } from "@/components/demo-notice";
import { StaffLogin } from "@/components/staff-login";
import { useStaff } from "@/hooks/use-staff";
import { useTVAudio } from "@/hooks/use-tv-audio";
import { useQueue } from "@/hooks/use-queue";
import { displayQueues } from "@/lib/queue";
import { carouselPage, collectReminders } from "@/lib/tv";

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
  const { rows, loading, error } = useQueue();
  const [now, setNow] = useState(0);
  const { status: soundStatus, ring: bell } = useTVAudio();
  const [displayError, setDisplayError] = useState("");
  const [flash, setFlash] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [columns, setColumns] = useState(2);
  const seen = useRef<Map<string, string> | null>(null);
  const reminderSlots = useRef<Map<string, number> | null>(null);
  useEffect(() => {
    const tick = () => {
      const value = Date.now(); setNow(value);
    };
    tick();
    const timer = setInterval(tick, 1000);
    const carousel = setInterval(() => setRotation((value) => value + 1), 15000);
    const screen = window.matchMedia("(min-width: 640px)");
    const resize = () => setColumns(screen.matches ? 2 : 1);
    resize(); screen.addEventListener("change", resize);
    return () => { clearInterval(timer); clearInterval(carousel); screen.removeEventListener("change", resize); };
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
  const waitingPage = carouselPage(waiting, rotation, columns * 3);
  const previousPage = carouselPage(previousCalls, rotation, 4);
  return (
    <div className="tv-board" lang="en">
      <DemoNotice language="en" />
      <header className="tv-header">
        <Brand showJapanese={false} homeLabel="Bari Ramen home" size="large" subtitle="" />
        <div className="tv-header-tools">
          <time aria-label="Jakarta time" className="tv-clock">{formatJakartaClock(now)}</time>
          <button aria-label="Toggle fullscreen" className="tv-fullscreen" onClick={() => {
            if (!document.fullscreenElement) void document.documentElement.requestFullscreen().catch(() => setDisplayError("Fullscreen is not available in this browser."));
            else void document.exitFullscreen().catch(() => setDisplayError("Could not exit fullscreen."));
          }}><Maximize size={20} /></button>
        </div>
      </header>
      <main className="tv-content">
        <section className="tv-queue-column" aria-label="Today's queue">
          <section key={flash} aria-labelledby="now-calling-title" className={`tv-current-call ${flash ? "call-flash" : ""}`}>
            <h1 id="now-calling-title" className="tv-section-label">{current ? "Now calling" : "Today's queue"}</h1>
            <p aria-live="polite" className={`tv-call-number ${current ? "" : "tv-call-empty"}`}>{loading ? "…" : current?.queue_number ?? "Join the queue"}</p>
            {current ? <>
              <p className="tv-call-details">{current.pax} {current.pax === 1 ? "guest" : "guests"}<span aria-hidden="true"> · </span>Call {current.call_count ?? 1} of 3</p>
              <p className="tv-call-instruction">Please order at the cashier.</p>
            </> : <p className="tv-call-instruction">Scan the QR code to join.<br /><span className="tv-call-help">Or ask us at the cashier.</span></p>}
          </section>
          {previousCalls.length > 0 && <section aria-labelledby="previous-calls-title" className="tv-other-calls">
            <h2 id="previous-calls-title">Also calling</h2>
            <ul>{previousPage.items.map(entry => <li key={entry.id}>{entry.queue_number}</li>)}</ul>
          </section>}
          <section className="tv-waiting" aria-labelledby="waiting-title">
            <div className="tv-waiting-heading">
              <h2 id="waiting-title" className="tv-section-label">Waiting list</h2>
              <p className="tv-page-number" role="status" aria-label={`Waiting list page ${waitingPage.page + 1} of ${waitingPage.pages}`}>Page {waitingPage.page + 1} of {waitingPage.pages}</p>
            </div>
            <div className="tv-waiting-area">
              {waitingPage.items.length ? <ol className="tv-waiting-grid" start={waitingPage.offset + 1}>
                {waitingPage.items.map(entry => <li key={entry.id} className="tv-waiting-row">{entry.queue_number}</li>)}
              </ol> : <p className="tv-waiting-empty">{loading ? "Loading the queue…" : "No parties waiting right now."}</p>}
            </div>
            {waitingPage.pages > 1 && <p className="sr-only" role="status">Waiting list page {waitingPage.page + 1} of {waitingPage.pages}. Pages change every 15 seconds.</p>}
          </section>
        </section>
        <aside className="tv-media-column" aria-label="Bari Ramen slideshow"><TVSlideshow /></aside>
      </main>
      {(error || displayError || soundStatus === "blocked" || soundStatus === "unavailable") && <div className="tv-system-status" role="status">
        {(error || displayError) ? <span>{displayError || "Connection interrupted. The queue will refresh automatically."}</span> : null}
        {soundStatus === "blocked" ? <span>Tap the screen once to allow sound.</span> : soundStatus === "unavailable" ? <span>Sound unavailable in this browser.</span> : null}
      </div>}
    </div>
  );
}
