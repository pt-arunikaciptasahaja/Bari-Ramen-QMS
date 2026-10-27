'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { importedTicketToken, linkCustomerVisit, resolveCustomerVisit, saveVisitToken } from '@/lib/customer-visit';
import { CUSTOMER_TICKET_KEY, completedTicketDestination } from '@/lib/customer-ticket-storage';
import { fetchCustomerTicket } from '@/lib/tickets';
import { serviceDate } from '@/lib/queue';
export function CustomerTicketTransfer() {
  const router=useRouter();
  const [value,setValue]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function connect(event: React.FormEvent) {
    event.preventDefault(); if(busy)return;
    setBusy(true);setError('');
    try {
      const seed=importedTicketToken(value,window.location.origin);
      if(!seed)throw new Error('Gunakan tautan tiket pribadi Bari Ramen yang disalin dari browser. Nomor seperti C-001 saja tidak cukup.');
      const token=await resolveCustomerVisit(seed)||seed;
      const ticket=await fetchCustomerTicket(token);
      if(!ticket||completedTicketDestination(ticket.status,ticket.service_date===serviceDate()))throw new Error('Tiket ini sudah berakhir. Hubungkan tautan dari tiket yang masih aktif.');
      // Never replace a different active party accidentally.
      const saved=localStorage.getItem(CUSTOMER_TICKET_KEY)??'';
      if(saved&&saved!==token){
        const current=await fetchCustomerTicket(saved);
        if(current&&!completedTicketDestination(current.status,current.service_date===serviceDate()))throw new Error('Aplikasi ini sudah menyimpan tiket aktif lain. Buka tiket tersebut atau minta bantuan staf.');
      }
      const linked=await linkCustomerVisit(seed);
      if(!linked)throw new Error('Tiket belum dapat dihubungkan. Buka tiket terbaru di browser.');
      saveVisitToken(linked);localStorage.setItem(CUSTOMER_TICKET_KEY,token);
      router.replace(`/ticket#t=${linked}`);
    }catch(e){setError(e instanceof Error?e.message:'Tiket belum dapat dihubungkan.');}
    finally{setBusy(false);}
  }
  return <details className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
    <summary className="cursor-pointer py-1 text-sm font-semibold">Sudah daftar di Safari, Chrome, atau aplikasi?</summary>
    <p className="mt-3 text-sm leading-6 text-slate-600">Tidak perlu daftar lagi. Di browser, buka tiket Anda dan ketuk Salin tautan tiket. Kembali ke aplikasi Bari Ramen, lalu tempel tautannya di bawah.</p>
    <form onSubmit={connect} className="mt-3">
      <label htmlFor="ticket-transfer" className="text-sm font-medium">Tautan tiket pribadi</label>
      <input id="ticket-transfer" type="url" required autoComplete="off" autoCapitalize="none" spellCheck={false} value={value} onChange={e=>setValue(e.target.value)} placeholder="https://…/ticket#t=…" className="mt-2 min-h-12 w-full rounded-lg border border-slate-300 px-3 text-base" />
      <button disabled={busy} className="mt-3 min-h-12 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Menghubungkan…':'Hubungkan tiket saya'}</button>
      {error&&<p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>}
    </form>
    <p className="mt-3 text-xs leading-5 text-slate-500">Di iPhone, Safari dan aplikasi menyimpan data secara terpisah. Di Android, gunakan Chrome dan profil yang sama; browser atau profil lain juga perlu dihubungkan. Setelah terhubung, keduanya mengikuti kunjungan terbaru melalui tautan pribadi ini selama 30 hari. Jangan bagikan tautan kepada orang lain.</p>
  </details>;
}
