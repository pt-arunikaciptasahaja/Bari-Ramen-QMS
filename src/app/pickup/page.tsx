'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2 } from 'lucide-react';
import { Brand } from '@/components/brand';
import { GroupBadge } from '@/components/group-badge';
import { fragmentToken, fetchPickup, ticketUrl, type PickupState } from '@/lib/tickets';
import { queueGroups } from '@/lib/groups';

export default function PickupPage() {
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision(value => value + 1);
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  const [state, setState] = useState<PickupState | null>(null);
  const [origin, setOrigin] = useState('');
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  useEffect(() => {
    const token = fragmentToken('screen');
    setConfigured(Boolean(token)); setOrigin(window.location.origin); setState(null); setError('');
    if (!token) return;
    let alive = true, busy = false;
    const load = async () => {
      if (busy) return;
      busy = true;
      try {
        const result = await fetchPickup(token);
        if (alive) { setState(result); setError(''); setLastUpdated(new Date().toLocaleTimeString('id-ID')); }
      } catch (e) {
        // Hide stale QR codes whenever the screen cannot verify the current ticket.
        if (alive) { setState(null); setError(e instanceof Error ? e.message : 'Koneksi terputus. Hubungi staf.'); }
      } finally { busy = false; }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    window.addEventListener('focus', load); window.addEventListener('online', load);
    return () => { alive = false; clearInterval(timer); window.removeEventListener('focus', load); window.removeEventListener('online', load); };
  }, [revision]);
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-4"><Brand /></header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-5 py-6 text-center">
        <h1 className="text-xl font-semibold">Tiket antrean Anda</h1>
        {configured === false ? <p className="mt-4 text-sm text-slate-600">Minta staf membuka tautan layar pelanggan dari dashboard.</p>
          : error ? <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">{error}</p>
          : !state ? <p role="status" className="mt-4 text-sm text-slate-500">Menghubungkan layar…</p>
          : state.kind === 'empty' ? <div className="mt-5 rounded-xl bg-white px-6 py-8"><p className="font-medium">Silakan daftar melalui staf</p><p className="mt-2 text-sm text-slate-500">QR tiket akan muncul setelah pendaftaran.</p></div>
          : state.kind === 'opened' ? <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-6 text-emerald-900"><CheckCircle2 className="mx-auto mb-3" size={32} /><p className="font-mono text-4xl font-semibold tabular-nums">{state.queue_number}</p><p className="mt-3 font-semibold">Tiket berhasil dibuka</p><p className="mt-2 text-sm">Simpan halaman di HP untuk memantau giliran.</p></div>
          : <section className="mt-4 w-full rounded-xl bg-white p-5" aria-label={`Ambil tiket ${state.queue_number}`}>
            <p className={`mx-auto mb-3 w-fit rounded-lg px-4 py-2 font-mono text-4xl font-semibold tabular-nums ${queueGroups[state.group_code].light}`}>{state.queue_number}</p>
            <GroupBadge group={state.group_code} pax={state.pax} />
            <div className="mx-auto my-4 w-fit max-w-full rounded-lg bg-white p-4"><QRCodeSVG value={ticketUrl(origin, state.token)} size={240} marginSize={4} level="M" title={`Pindai untuk membuka antrean ${state.queue_number}`} style={{maxWidth:'100%',height:'auto'}} /></div>
            <p className="font-semibold">Scan untuk membuka tiket di HP</p>
            <p className="mt-2 text-sm text-slate-500">Pastikan nomor dan jumlah orang sesuai pendaftaran Anda.</p>
            {state.pending > 1 && <p className="mt-3 text-xs text-slate-500"><span className="font-mono tabular-nums">{state.pending - 1}</span> tiket berikutnya menunggu ditampilkan.</p>}
          </section>}
      </main>
      <footer className="px-5 pb-4 text-center text-xs text-slate-500">Tidak membawa HP? Antrean tetap berlaku, silakan hubungi staf.{lastUpdated && <span className="mt-1 block font-mono tabular-nums">Diperbarui {lastUpdated}</span>}</footer>
    </div>
  );
}
