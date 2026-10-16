'use client';
import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ExternalLink, QrCode, X } from 'lucide-react';
import { Button } from './ui/button';
import { GroupBadge } from './group-badge';
import { createPickupScreen, skipTicketHandoff, staffTicketToken, ticketUrl } from '@/lib/tickets';
import type { QueueEntry } from '@/lib/queue';

export function PickupScreenSetup({rows,onChanged}:{rows:QueueEntry[];onChanged:()=>void}) {
  const [url,setUrl] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const lock = useRef(false);
  const waiting = rows.filter(row=>!row.ticket_opened_at && !row.ticket_skipped_at);
  async function skipFirst() {
    const first=waiting[0];
    if(!first || lock.current || !window.confirm(`Lewati scan untuk ${first.queue_number}? Antrean meja tetap aktif.`))return;
    lock.current=true;setBusy(true);setMessage('');
    try{await skipTicketHandoff(first.id);onChanged();setMessage(`Scan ${first.queue_number} dilewati. Antrean meja tetap aktif.`);}
    catch(e){setMessage(e instanceof Error ? e.message : 'Tidak dapat melewati scan.');}
    finally{lock.current=false;setBusy(false);}
  }
  async function prepare() {
    if (lock.current) return;
    lock.current=true; setBusy(true); setMessage('');
    try {
      const screen=await createPickupScreen();
      setUrl(`${window.location.origin}/pickup#screen=${screen.token}`);
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Layar belum dapat disiapkan.'); }
    finally { lock.current=false; setBusy(false); }
  }
  return <section aria-labelledby="pickup-screen-title" className="mb-5 rounded-xl bg-slate-100/70 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="pickup-screen-title" className="text-sm font-semibold">Layar pengambilan tiket</h2><p className="mt-1 text-xs text-slate-500">Hubungkan HP atau tablet yang menghadap tamu. Setiap QR tetap tampil sampai tiket dibuka atau scan dilewati.</p></div>
      <Button variant="outline" disabled={busy} onClick={()=>void prepare()}><QrCode size={16} />{busy ? 'Menyiapkan…' : url ? 'Buat tautan layar baru' : 'Siapkan layar pelanggan'}</Button>
    </div>
    {waiting.length>0 && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-xs"><p><span className="font-mono tabular-nums">{waiting.length}</span> tiket menunggu scan · Berikutnya <span className="font-mono font-semibold tabular-nums">{waiting[0].queue_number}</span></p><button disabled={busy} onClick={()=>void skipFirst()} className="min-h-10 rounded-md bg-slate-100 px-3 font-medium disabled:opacity-50">Lewati scan {waiting[0].queue_number}</button></div>}
    {url && <div className="mt-3 rounded-lg bg-white p-3">
      <p className="text-xs leading-5 text-slate-600">Buka tautan ini hanya pada perangkat layar pelanggan. Berlaku 12 jam dan tidak memberikan akses ke dashboard staf.</p>
      <label htmlFor="pickup-screen-link" className="mt-3 block text-xs font-medium">Tautan layar</label>
      <input id="pickup-screen-link" readOnly value={url} onFocus={e=>e.target.select()} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-xs" />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" onClick={async()=>{try{await navigator.clipboard.writeText(url);setMessage('Tautan layar disalin. Buka di perangkat pelanggan.');}catch{setMessage('Pilih dan salin tautan layar di atas.');}}}>Salin tautan layar</Button>
        <Button asChild variant="outline"><a href={url} target="_blank" rel="noreferrer"><ExternalLink size={15} />Buka layar</a></Button>
      </div>
    </div>}
    {message && <p role="status" className="mt-2 text-xs text-slate-600">{message}</p>}
  </section>;
}

export function TicketAccessTools({entry,onChanged}:{entry:QueueEntry;onChanged:()=>void}) {
  const [link,setLink]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const lock=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{if(link) dialog.current?.showModal();},[link]);
  async function showTicket() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try {setLink(ticketUrl(window.location.origin,await staffTicketToken(entry.id)));}
    catch(e){setError(e instanceof Error ? e.message : 'QR belum dapat dibuka.');}
    finally{lock.current=false;setBusy(false);}
  }
  async function skip() {
    if(lock.current || !window.confirm(`Lewati scan untuk ${entry.queue_number}? Antrean meja tetap aktif.`))return;
    lock.current=true;setBusy(true);setError('');
    try{await skipTicketHandoff(entry.id);onChanged();}
    catch(e){setError(e instanceof Error ? e.message : 'Tidak dapat melewati scan.');}
    finally{lock.current=false;setBusy(false);}
  }
  function close(){dialog.current?.close();setLink('');}
  return <div className="mt-2 font-sans text-xs font-normal text-slate-500">
    <p>{entry.ticket_opened_at ? 'Sudah dibuka di HP' : entry.ticket_skipped_at ? 'Scan dilewati' : 'Belum dibuka di HP'}</p>
    <div className="mt-1 flex flex-wrap gap-x-3">
      <button disabled={busy} onClick={()=>void showTicket()} className="min-h-9 font-medium underline disabled:opacity-50" aria-label={`QR tiket ${entry.queue_number}`}>QR tiket</button>
      {!entry.ticket_opened_at && !entry.ticket_skipped_at && <button disabled={busy} onClick={()=>void skip()} className="min-h-9 underline disabled:opacity-50" aria-label={`Lewati scan ${entry.queue_number}`}>Lewati scan</button>}
    </div>
    {error && <p role="alert" className="mt-1 max-w-48 text-rose-700">{error}</p>}
    <dialog ref={dialog} onCancel={()=>setLink('')} className="m-auto w-[min(92vw,380px)] rounded-xl bg-white p-5 text-center text-slate-900 backdrop:bg-slate-900/50" aria-labelledby={`ticket-dialog-${entry.id}`}>
      <button onClick={close} aria-label="Tutup QR tiket" className="absolute right-3 top-3 rounded-md p-2"><X size={18}/></button>
      <h2 id={`ticket-dialog-${entry.id}`} className="mb-3 font-mono text-3xl font-semibold tabular-nums">{entry.queue_number}</h2>
      <GroupBadge group={entry.group_code} pax={entry.pax}/>
      {link && <QRCodeSVG className="mx-auto my-4" value={link} size={240} marginSize={4} title={`QR tiket ${entry.queue_number}`} style={{maxWidth:'100%',height:'auto'}}/>}
      <p className="text-sm">Scan untuk membuka tiket di HP.</p>
      <Button variant="outline" className="mt-4 w-full" onClick={async()=>{try{await navigator.clipboard.writeText(link);}catch{setError('Tautan tidak dapat disalin. Gunakan QR tiket.');}}}>Salin tautan tiket</Button>
    </dialog>
  </div>;
}
