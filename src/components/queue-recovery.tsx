'use client';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { Button } from './ui/button';
import { serviceDate, statusLabel, type QueueEntry } from '@/lib/queue';
import { recoveryReasons, validRecoveryReason, type QueueEdit } from '@/lib/queue-edits';
import { queueEditHistory, restoreQueue } from '@/lib/recovery';

const editTime = (value: string) => new Date(value).toLocaleString('id-ID', {
  timeZone: 'Asia/Jakarta', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
});
export function QueueEditBadge({entry}:{entry:QueueEntry}) {
  const dialog = useRef<HTMLDialogElement>(null), generation = useRef(0);
  const titleId = useId();
  const [rows,setRows] = useState<QueueEdit[]>([]);
  const [loading,setLoading] = useState(false), [error,setError] = useState('');
  useEffect(()=>()=>{generation.current++;},[]);
  async function open() {
    const current = ++generation.current;
    setLoading(true);setRows([]);setError('');dialog.current?.showModal();
    try { const result = await queueEditHistory(entry.id); if(current===generation.current)setRows(result); }
    catch(e) { if(current===generation.current)setError(e instanceof Error ? e.message : 'Riwayat belum dapat dimuat.'); }
    finally { if(current===generation.current)setLoading(false); }
  }
  function close(){generation.current++;dialog.current?.close();}
  if (!(entry.edit_count && entry.edit_count > 0)) return null;
  return <div className="mt-2 font-sans text-xs font-normal">
    <button type="button" onClick={()=>void open()} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-amber-100 px-2 py-1 font-semibold text-amber-900"
      aria-label={`Lihat riwayat perubahan ${entry.queue_number}`} title={entry.last_edited_at ? `Terakhir diubah ${editTime(entry.last_edited_at)} WIB` : 'Lihat riwayat perubahan'}>
      <History size={13}/>Diedit · {entry.edit_count}×
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={()=>{generation.current++;}} className="m-auto max-h-[85dvh] w-[min(94vw,520px)] overflow-y-auto rounded-xl bg-white p-5 text-left text-slate-900 backdrop:bg-slate-900/50">
      <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">Riwayat perubahan {entry.queue_number}</h2><button type="button" aria-label="Tutup riwayat perubahan" onClick={close} className="min-h-10 min-w-10 rounded-md p-2"><X size={18}/></button></div>
      {loading ? <p role="status" className="mt-4 text-sm">Memuat riwayat perubahan…</p> : error ? <div className="mt-4"><p role="alert" className="text-sm text-rose-800">{error}</p><button type="button" onClick={()=>void open()} className="mt-2 min-h-10 text-sm underline">Coba lagi</button></div> : <ol className="mt-4 space-y-3">
        {rows.map(row=><li key={row.id} className="rounded-lg border border-slate-200 p-3 text-sm">
          <p className="font-semibold">Perubahan #{row.edit_number} · {recoveryReasons[row.reason]}</p>
          <p className="mt-1">{statusLabel[row.from_status]} → Menunggu</p>
          <p className="mt-1 text-xs text-slate-500">{editTime(row.created_at)} WIB · {row.actor_id==='demo' ? 'Staf demo' : `ID staf: ${row.actor_id}`}</p>
          {row.note && <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">Catatan: {row.note}</p>}
        </li>)}
        {!rows.length && <li className="text-sm text-slate-500">Belum ada riwayat perubahan.</li>}
      </ol>}
      <Button type="button" variant="outline" className="mt-4 w-full" onClick={close}>Tutup</Button>
    </dialog>
  </div>;
}

export function QueueRecoveryAction({entry,onChanged,disabled=false}:{entry:QueueEntry;onChanged:(restored:QueueEntry)=>void|Promise<void>;disabled?:boolean}) {
  const dialog = useRef<HTMLDialogElement>(null), lock = useRef(false), request = useRef('');
  const titleId = useId(), reasonId = useId(), noteId = useId();
  const [snapshot,setSnapshot] = useState<QueueEntry|null>(null);
  const [reason,setReason] = useState(''), [note,setNote] = useState('');
  const [busy,setBusy] = useState(false), [error,setError] = useState(''), [message,setMessage] = useState('');
  const today = entry.service_date === serviceDate();
  if (!['called','seated','no-show'].includes(entry.status)) return null;
  function open() {
    if(lock.current)return;
    setSnapshot({...entry});setReason('');setNote('');setError('');setMessage('');request.current=crypto.randomUUID();
    dialog.current?.showModal();
  }
  function close(){if(!lock.current)dialog.current?.close();}
  async function submit(event:FormEvent) {
    event.preventDefault();
    if(lock.current || !snapshot || !validRecoveryReason(reason))return;
    lock.current=true;setBusy(true);setError('');
    try {
      const restored=await restoreQueue(snapshot,reason,note,request.current);
      setMessage(restored.status==='waiting' ? `${restored.queue_number} kembali menunggu. Riwayat perubahan telah disimpan.` : 'Pemulihan sudah diproses sebelumnya. Periksa status tiket terbaru.');
      dialog.current?.close();
      await onChanged(restored);
    } catch(e) {setError(e instanceof Error ? e.message : 'Tiket belum dapat dipulihkan. Periksa koneksi dan coba lagi.');}
    finally {lock.current=false;setBusy(false);}
  }
  return <div className="text-xs">
    <Button type="button" variant="outline" disabled={disabled||busy||!today} title={!today ? 'Pemulihan hanya tersedia pada hari pendaftaran.' : undefined}
      className="min-h-10 px-3 text-xs" onClick={open}><RotateCcw size={14}/>{entry.status==='called' ? 'Batalkan panggilan' : 'Kembalikan ke antrean'}</Button>
    {message && <p role="status" className="mt-2 max-w-56 text-emerald-800">{message}</p>}
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={event=>{if(lock.current)event.preventDefault();}} className="m-auto max-h-[90dvh] w-[min(94vw,480px)] overflow-y-auto rounded-xl bg-white p-5 text-left text-slate-900 backdrop:bg-slate-900/50">
      <form onSubmit={event=>void submit(event)}>
        <div className="flex items-start justify-between gap-3"><h2 id={titleId} className="text-lg font-semibold">Kembalikan {snapshot?.queue_number} ke antrean</h2><button type="button" aria-label="Tutup pemulihan antrean" disabled={busy} onClick={close} className="min-h-10 min-w-10 p-2"><X size={18}/></button></div>
        <p className="mt-3 text-sm leading-6">Tiket kembali ke status Menunggu dengan ID, nomor, dan urutan pendaftaran yang sama. Staf dapat memanggilnya kembali sesuai ketersediaan meja.</p>
        <p className="mt-2 text-xs leading-5 text-slate-600">Hitungan panggilan dimulai dari awal saat dipanggil kembali. Riwayat perubahan disimpan. Notifikasi dan pesan yang sudah diterima pelanggan tetap dapat terlihat.</p>
        <label htmlFor={reasonId} className="mt-4 block text-sm font-semibold">Alasan pemulihan</label>
        <select id={reasonId} required value={reason} disabled={busy} onChange={event=>{setReason(event.target.value);request.current=crypto.randomUUID();}} className="mt-2 min-h-12 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
          <option value="" disabled>Pilih alasan</option>
          {Object.entries(recoveryReasons).filter(([key])=>key!=='late-arrival'||snapshot?.status==='no-show').map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select>
        <label htmlFor={noteId} className="mt-4 block text-sm font-semibold">Catatan tambahan <span className="font-normal text-slate-500">(opsional)</span></label>
        <textarea id={noteId} value={note} disabled={busy} maxLength={200} rows={3} placeholder="Contoh: Tamu sudah kembali ke kasir setelah nomor dilewati." onChange={event=>{setNote(event.target.value);request.current=crypto.randomUUID();}} className="mt-2 w-full rounded-md border border-slate-300 p-3 text-sm"/>
        {error && <p role="alert" className="mt-3 text-sm text-rose-800">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={close}>Batal</Button><Button type="submit" disabled={busy||!validRecoveryReason(reason)}>{busy ? 'Memulihkan…' : 'Kembalikan ke antrean'}</Button></div>
      </form>
    </dialog>
  </div>;
}
