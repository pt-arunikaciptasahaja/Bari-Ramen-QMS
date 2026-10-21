'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from './ui/button';

export function RegistrationQr({ poster = false }: { poster?: boolean }) {
  const [url, setUrl] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setUrl(`${window.location.origin}/register`); }, []);
  return <section aria-labelledby="registration-qr-title" className={`rounded-xl bg-white p-5 ${poster ? 'text-center' : 'mb-5 border border-slate-200'}`}>
    <h2 id="registration-qr-title" className={poster ? 'text-3xl font-bold' : 'font-semibold'}>Scan untuk daftar antrean</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">Isi nama dan jumlah orang di HP Anda. Tiket langsung terbuka setelah mendaftar.</p>
    <div className={`mt-4 flex flex-wrap items-center gap-5 ${poster ? 'justify-center' : ''}`}>
      {url ? <QRCodeSVG value={url} size={poster ? 300 : 160} marginSize={4} level="M" title="QR pendaftaran antrean Bari Ramen" style={{ maxWidth: '100%', height: 'auto' }} /> : <p role="status">Menyiapkan QR…</p>}
      <div className="min-w-0 text-sm">
        <a href="/register" className="block break-all py-3 font-semibold underline">{url || 'Buka formulir pendaftaran'}</a>
        <p className="max-w-sm leading-6 text-slate-500">Tidak membawa HP atau perlu bantuan? Silakan daftar melalui staf di kasir.</p>
        <div className={`mt-3 flex flex-wrap gap-2 print:hidden ${poster ? 'justify-center' : ''}`}>
          <Button variant="outline" disabled={!url} onClick={async () => {
            try { await navigator.clipboard.writeText(url); setMessage('Tautan pendaftaran disalin.'); }
            catch { setMessage('Salin alamat formulir di atas atau gunakan QR.'); }
          }}>Salin tautan</Button>
          {poster ? <Button variant="outline" onClick={() => window.print()}>Cetak QR</Button> : <Button asChild variant="outline"><a href="/register/qr" target="_blank" rel="noreferrer">Buka / cetak QR</a></Button>}
        </div>
        {message && <p role="status" className="mt-2 text-xs text-slate-600 print:hidden">{message}</p>}
      </div>
    </div>
  </section>;
}
