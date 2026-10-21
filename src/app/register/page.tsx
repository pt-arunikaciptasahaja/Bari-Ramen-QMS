'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/brand';
import { DemoNotice } from '@/components/demo-notice';
import { QueueForm } from '@/components/queue-form';
import { registerCustomer } from '@/lib/registration';
import { fetchCustomerTicket, ticketUrl, validTicketToken } from '@/lib/tickets';
import { isDemo } from '@/lib/supabase';

export default function RegisterPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let alive = true;
    async function resume() {
      try {
        const token = localStorage.getItem('bari-customer-ticket-v1') ?? '';
        if (!isDemo && validTicketToken(token)) {
          const ticket = await fetchCustomerTicket(token);
          if (alive && ticket && ['waiting', 'called'].includes(ticket.status)) {
            router.replace(`/ticket#t=${token}`);
            return;
          }
        }
      } catch { /* A guest can retry registration if storage or the connection is unavailable. */ }
      if (alive) setChecking(false);
    }
    void resume();
    return () => { alive = false; };
  }, [router]);
  async function submit(name: string, pax: number, requestId: string, phone: string) {
    // Recheck before writing, including tickets obtained from the staff pickup screen.
    let saved = '';
    try { saved = localStorage.getItem('bari-customer-ticket-v1') ?? ''; } catch { /* Storage is optional. */ }
    if (!isDemo && validTicketToken(saved)) {
      const current = await fetchCustomerTicket(saved);
      if (current && ['waiting', 'called'].includes(current.status)) {
        router.replace(`/ticket#t=${saved}`);
        return;
      }
    }
    const ticket = await registerCustomer(name, pax, requestId, phone);
    try { localStorage.setItem('bari-customer-ticket-v1', ticket.token); } catch { /* The URL also retains access. */ }
    window.location.assign(ticketUrl(window.location.origin, ticket.token));
  }
  return <>
    <DemoNotice />
    <header className="mx-auto max-w-md px-4 py-5"><Brand /></header>
    <main className="mx-auto max-w-md px-4 pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">Daftar antrean</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">Isi satu formulir untuk satu rombongan. Setelah mendaftar, tiket langsung terbuka di HP Anda.</p>
      <section aria-label="Formulir pendaftaran antrean" className="mt-5 rounded-xl bg-white p-5">
        {checking ? <p role="status" className="text-sm text-slate-500">Memeriksa tiket Anda…</p> : <QueueForm onRegister={submit} />}
      </section>
      <p className="mt-4 text-xs leading-6 text-slate-500">Antrean berlaku untuk hari ini, bukan reservasi meja pada jam tertentu. Urutan panggilan mengikuti ketersediaan meja sesuai jumlah orang. Tetap berada di sekitar restoran.</p>
      <p className="mt-3 text-sm leading-6 text-slate-600">Perlu bantuan mengisi? Staf di kasir tetap dapat mendaftarkan Anda.</p>
      <Link href="/ticket" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">Buka tiket saya</Link>
      <Link href="/" className="ml-5 inline-flex min-h-11 items-center text-sm text-slate-500">Beranda</Link>
    </main>
  </>;
}
