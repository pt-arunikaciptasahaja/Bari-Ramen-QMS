'use client';
import { CUSTOMER_VISIT_KEY, resolveCustomerVisit, savedVisitToken, saveVisitToken } from '@/lib/customer-visit';
import { serviceDate } from '@/lib/queue';
import { JakartaClock } from "@/components/jakarta-clock";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/brand';
import { DemoNotice } from '@/components/demo-notice';
import { QueueForm } from '@/components/queue-form';
import { registerCustomer } from '@/lib/registration';
import { fetchCustomerTicket, ticketUrl, validTicketToken } from '@/lib/tickets';
import { syncCustomerTicket } from '@/lib/customer-ticket-storage';
import { isDemo } from '@/lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [returnVisit,setReturnVisit] = useState('');
  const [checking, setChecking] = useState(true);
  const [activeTicketHref, setActiveTicketHref] = useState('');
  useEffect(() => {
    setReturnVisit(new URLSearchParams(window.location.search).get('visit') ?? '');
    let alive = true, busy = false;
    async function resume() {
      if (busy) return; busy = true;
      try {
        const visit = savedVisitToken();
        const resolved = visit ? await resolveCustomerVisit(visit) : '';
        if (visit && !resolved) localStorage.removeItem(CUSTOMER_VISIT_KEY);
        const token = resolved || localStorage.getItem('bari-customer-ticket-v1') || '';
        if (!isDemo && validTicketToken(token)) {
          const ticket = await fetchCustomerTicket(token);
          if (ticket) syncCustomerTicket(localStorage,token,ticket.status);
          if (alive && ticket && ticket.service_date === serviceDate() && ['waiting', 'called'].includes(ticket.status)) {
            const href = `/ticket#t=${resolved ? visit : token}`;
            setActiveTicketHref(href);
            router.replace(href);
            return;
          }
        }
      } catch { /* A guest can retry registration if storage or the connection is unavailable. */ }
      busy = false;
      if (alive) setChecking(false);
    }
    void resume();
    const timer = setInterval(() => void resume(),15000);
    window.addEventListener('pageshow',resume); window.addEventListener('focus',resume); window.addEventListener('online',resume);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('pageshow',resume); window.removeEventListener('focus',resume); window.removeEventListener('online',resume); };
  }, [router]);
  async function submit(name: string, pax: number, requestId: string, phone: string) {
    // Recheck before writing, including tickets obtained from the staff pickup screen.
    let saved = '';
    try { saved = localStorage.getItem('bari-customer-ticket-v1') ?? ''; } catch { /* Storage is optional. */ }
    const visit=savedVisitToken();
    const resolved=visit ? await resolveCustomerVisit(visit) : '';
    if(resolved) saved=resolved;
    if (!isDemo && validTicketToken(saved)) {
      const current = await fetchCustomerTicket(saved);
      if (current && current.service_date === serviceDate() && ['waiting', 'called'].includes(current.status)) {
        router.replace(`/ticket#t=${resolved ? visit : saved}`);
        return;
      }
    }
    const ticket = await registerCustomer(name, pax, requestId, phone);
    saveVisitToken(ticket.visit_token);
    try { localStorage.setItem('bari-customer-ticket-v1', ticket.token); } catch { /* The URL also retains access. */ }
    window.location.assign(ticketUrl(window.location.origin, ticket.visit_token || ticket.token));
  }
  return <>
    <DemoNotice />
    <header className="mx-auto max-w-md px-4 py-5"><Brand /><JakartaClock /></header>
    <main className="mx-auto max-w-md px-4 pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">Selamat datang teman BARI</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Satu pendaftar untuk setiap rombongan.</p>
      {returnVisit && <p role="status" className="mt-4 rounded-lg border-l-2 border-brand bg-brand-soft px-4 py-3 text-sm leading-6 text-slate-700">{returnVisit === 'complete' ? 'Kunjungan sebelumnya sudah selesai. Silakan daftar untuk kunjungan baru.' : 'Antrean sebelumnya sudah berakhir. Silakan daftar untuk kunjungan baru.'}</p>}
      <section aria-label="Formulir pendaftaran antrean" className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        {checking ? <p role="status" className="text-sm text-slate-500">Memeriksa tiket Anda…</p> : <QueueForm onRegister={submit} />}
      </section>
      <p className="mt-4 text-xs leading-6 text-slate-500">Panggilan mengikuti ketersediaan meja sesuai jumlah orang. Mohon tetap berada di sekitar restoran.</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">Perlu bantuan? Staf di kasir siap membantu.</p>
      <nav aria-label="Navigasi pendaftaran" className="mt-3 flex flex-wrap gap-x-5">
        {activeTicketHref && <Link href={activeTicketHref} className="inline-flex min-h-11 items-center text-sm font-semibold underline">Lihat tiket saya</Link>}
        <Link href="/" className="inline-flex min-h-11 items-center text-sm text-slate-500">Beranda</Link>
      </nav>
    </main>
  </>;
}
