'use client';
import { useEffect, useState } from 'react';
import { JakartaClock } from "@/components/jakarta-clock";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Check, Clock3 } from 'lucide-react';
import { Brand } from '@/components/brand';
import { GroupBadge } from '@/components/group-badge';
import { useQueue } from '@/hooks/use-queue';
import { aheadCount, serviceDate, statusLabel } from '@/lib/queue';
import { fetchCustomerTicket, fragmentToken, validTicketToken, type CustomerTicket } from '@/lib/tickets';
import { queueGroups } from '@/lib/groups';
import { CUSTOMER_TICKET_KEY, completedTicketDestination, syncCustomerTicket } from '@/lib/customer-ticket-storage';
import { CALL_POLICY_COPY, customerStatusCopy } from '@/lib/customer-copy';
import { CUSTOMER_VISIT_KEY, linkCustomerVisit, resolveCustomerVisit, savedVisitToken, saveVisitToken } from '@/lib/customer-visit';
import { ticketUrl } from '@/lib/tickets';
import { CustomerAppGuide } from '@/components/customer-app-guide';
import { PushPermission } from '@/components/push-permission';

export default function CustomerTicketPage() {
  const router = useRouter();
  const [ticket, setTicket] = useState<CustomerTicket | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState('');
  const [retry, setRetry] = useState(0);
  const [ticketToken, setTicketToken] = useState('');
  const [visitToken,setVisitToken] = useState('');
  const [copyMessage,setCopyMessage] = useState('');
  useEffect(() => {
    const changed = () => { setTicket(null); setTicketToken(''); setError(''); setLoading(true); setRetry(value => value + 1); };
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const board = useQueue(false, Boolean(ticket));
  useEffect(() => {
    let token = fragmentToken('t') || savedVisitToken();
    if (!token) { try { token = localStorage.getItem('bari-customer-ticket-v1') ?? ''; } catch { /* Storage is optional. */ } }
    if (!validTicketToken(token)) { router.replace('/register'); return; }
    let alive = true, busy = false, opened = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const resolved = await resolveCustomerVisit(token);
        const currentToken = resolved || token;
        const result = await fetchCustomerTicket(currentToken, !opened);
        if (!alive) return;
        let linked = resolved ? token : '';
        if (!linked && result && !completedTicketDestination(result.status,result.service_date===serviceDate())) linked=await linkCustomerVisit(currentToken);
        if (!alive) return;
        if (linked) { saveVisitToken(linked);setVisitToken(linked); token=linked; if(fragmentToken('t')!==linked)window.history.replaceState(null,'',`/ticket#t=${linked}`); }
        else { try { if(savedVisitToken()===token)localStorage.removeItem(CUSTOMER_VISIT_KEY); } catch { /* Optional storage. */ } }
        if (alive) {
          if (!result) { router.replace('/register?visit=ended'); return; }
          if (result && completedTicketDestination(result.status, result.service_date === serviceDate())) {
            let saved = '';
            try { saved = localStorage.getItem(CUSTOMER_TICKET_KEY) ?? ''; syncCustomerTicket(localStorage,currentToken,result.status); } catch { /* Optional storage. */ }
            if (saved !== currentToken && validTicketToken(saved)) {
              const newer = await fetchCustomerTicket(saved);
              if (!alive) return;
              if (newer && !completedTicketDestination(newer.status,newer.service_date === serviceDate())) {
                window.history.replaceState(null,'',`/ticket#t=${saved}`);
                setTicket(null); setTicketToken(''); setRetry(value=>value+1); return;
              }
            }
            if (alive) router.replace(completedTicketDestination(result.status, false)!);
            return;
          }
          const firstLoad = !opened; opened = Boolean(result); setTicket(result); setToday(serviceDate());
          if (result) { setTicketToken(currentToken); try { syncCustomerTicket(localStorage,currentToken,result.status,firstLoad || currentToken !== token); } catch { /* Original link remains usable without storage. */ } }
          setError(result ? '' : 'Tiket tidak tersedia atau masa berlakunya sudah berakhir. Hubungi staf.');
        }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : 'Tiket belum dapat dimuat.'); }
      finally { busy = false; if (alive) setLoading(false); }
    };
    void load();
    const timer = setInterval(() => void load(), 15000);
    const storageChanged = (event: StorageEvent) => { if (event.key === CUSTOMER_TICKET_KEY || event.key === CUSTOMER_VISIT_KEY) void load(); };
    window.addEventListener('focus', load); window.addEventListener('online', load); window.addEventListener('pageshow',load); window.addEventListener('storage',storageChanged);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('online', load); window.removeEventListener('pageshow',load); window.removeEventListener('storage',storageChanged); };
  }, [retry, router]);
  const live = board.rows.find(row => row.id === ticket?.id);
  const entry = ticket ? {...ticket, ...(live ? {status:live.status,called_at:live.called_at,call_count:live.call_count,last_call_at:live.last_call_at} : {})} : null;
  const expired = Boolean(entry && today && entry.service_date !== today);
  const called = entry?.status === 'called' && !expired;
  useEffect(() => {
    if (!entry || !ticketToken || !['seated','no-show'].includes(entry.status)) return;
    try { syncCustomerTicket(localStorage,ticketToken,entry.status); } catch { /* Storage is optional. */ }
    setRetry(value=>value+1);
  },[entry?.status,ticketToken]);
  return <>
    <header className="mx-auto max-w-md px-4 py-4"><Brand /><JakartaClock /></header>
    <main className="mx-auto max-w-md px-4 pb-8">
      <h1 className="text-xl font-semibold">{called ? 'Giliran Anda sudah tiba' : 'Tiket antrean Anda'}</h1>
      {loading && <p role="status" className="mt-5 text-sm text-slate-500">Membuka tiket…</p>}
      {entry && <>
        <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="p-5 text-center">
            <p className="text-xs text-slate-500">{entry.status === "seated" ? "Nomor kunjungan sebelumnya" : "Nomor antrean"}</p>
            <p className={`mx-auto my-3 w-fit rounded-lg px-4 py-2 font-mono text-5xl font-semibold tabular-nums ${queueGroups[entry.group_code].light}`}>{entry.queue_number}</p>
            <GroupBadge group={entry.group_code} pax={entry.pax} />
            <p role="status" aria-live="polite" className={`mt-4 flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-semibold ${called ? 'bg-amber-50 text-amber-900' : entry.status === 'seated' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
              {called ? <BellRing size={18} /> : entry.status === 'seated' ? <Check size={18} /> : <Clock3 size={18} />}
              {expired ? 'Antrean sudah berakhir' : statusLabel[entry.status]}
            </p>
            {called && <p role="status" className="mt-3 text-lg font-semibold text-amber-900">Panggilan {entry.call_count ?? 1}/3</p>}
            {called && entry.called_at && <p className="mt-2 text-xs leading-5 text-slate-500">Panggilan pertama pukul <span className="font-mono tabular-nums">{new Date(entry.called_at).toLocaleTimeString('id-ID',{timeZone:'Asia/Jakarta',hour:'2-digit',minute:'2-digit'})}</span> WIB. Silakan segera menuju kasir dan tunjukkan tiket ini kepada staf.</p>}
          </div>
          {entry.status === 'waiting' && !expired && <div className="bg-brand-soft px-5 py-4">
            <p aria-live="polite" className="text-sm"><span className="font-mono font-semibold tabular-nums">{board.loading || board.error ? '…' : aheadCount(board.rows, {...entry,source:'walk-in'})}</span> rombongan dalam kelompok {entry.group_code} di depan Anda</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Urutan panggilan mengikuti ketersediaan meja sesuai jumlah orang dalam rombongan Anda.</p>
          </div>}
        </section>
        {called && (entry.call_count ?? 1) >= 3 && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Ini panggilan terakhir untuk nomor Anda. Silakan segera menuju kasir.</p>}
        <p className="mt-4 text-sm leading-6 text-slate-600">{customerStatusCopy(entry.status, expired)}</p>
        {!expired && ['waiting','called'].includes(entry.status) && <p className="mt-3 text-xs leading-5 text-slate-500">{CALL_POLICY_COPY}</p>}
        {(entry.status === 'seated' || expired) && <Link href="/register" className="mt-4 flex min-h-12 items-center justify-center rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white">Daftar antrean baru</Link>}
        {entry.status === 'seated' && <p className="mt-2 text-xs leading-5 text-slate-500">Kunjungan ini sudah selesai. Untuk kunjungan berikutnya, daftar kembali untuk mendapatkan nomor baru.</p>}
        <PushPermission ticketToken={ticketToken} ended={expired || entry.status==='seated' || entry.status==='no-show'} />
        <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Buka tiket dari Layar Utama</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Jika Bari Ramen sudah ada di Layar Utama, salin tautan ini. Buka aplikasi, pilih Sudah daftar di Safari, Chrome, atau aplikasi?, lalu tempel tautannya. Tidak perlu daftar ulang.</p>
          <button disabled={!visitToken} onClick={async()=>{try{await navigator.clipboard.writeText(ticketUrl(window.location.origin,visitToken));setCopyMessage('Tautan disalin. Buka aplikasi Bari Ramen dari Layar Utama dan hubungkan tiket Anda.');}catch{setCopyMessage('Salin tautan dari kolom di bawah, lalu tempel di aplikasi Bari Ramen.');}}} className="mt-3 min-h-12 w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Salin tautan tiket</button>
          {copyMessage&&<><p role="status" className="mt-2 text-sm leading-6 text-slate-600">{copyMessage}</p><label className="mt-2 block text-xs text-slate-500">Tautan pribadi<input readOnly value={ticketUrl(window.location.origin,visitToken)} onFocus={event=>event.target.select()} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label></>}
          <p className="mt-2 text-xs leading-5 text-slate-500">Tautan ini menghubungkan kunjungan Anda selama 30 hari. Simpan untuk Anda sendiri.</p>
        </section>
        <CustomerAppGuide />
        <p className="mt-3 text-xs leading-5 text-slate-500">{entry.status === 'seated' ? 'Tautan ini tetap menampilkan tiket kunjungan sebelumnya.' : 'Simpan tautan tiket ini dan tetap berada di sekitar restoran. Anda dapat membukanya kembali selama antrean hari ini.'}</p>
        <p className="mt-2 text-xs text-slate-500">{board.connection} · Berlaku untuk hari ini</p>
      </>}
      {(error || board.error) && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error || board.error}{entry ? ' Data mungkin belum terbaru.' : ''}</p>}
      <button onClick={() => setRetry(value=>value+1)} className="mt-4 min-h-11 rounded-md bg-slate-100 px-4 text-sm font-medium">Periksa status terbaru</button>
      <Link href="/" className="mt-4 block py-3 text-sm text-slate-500">Kembali ke beranda</Link>
    </main>
  </>;
}
