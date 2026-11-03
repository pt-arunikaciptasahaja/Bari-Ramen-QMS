'use client';
import { useEffect, useState } from 'react';

export function CustomerAppGuide({ context = 'ticket' }: { context?: 'registration' | 'ticket' }) {
  const [platform, setPlatform] = useState<'ios' | 'android' | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setPlatform(ios ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : null);
  }, []);
  if (!platform || (context === 'registration' && platform !== 'ios')) return null;

  return <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
    <summary className="cursor-pointer py-1 font-semibold text-slate-800">{platform === 'ios' ? 'Ingin notifikasi di iPhone atau iPad?' : 'Simpan tiket di Layar Utama'}</summary>
    {platform === 'ios' ? <>
      {context === 'registration' ? <>
        <p className="mt-3">Untuk menerima notifikasi, buka Bari Ramen dari Layar Utama sebelum mendaftar.</p>
        <ol className="ml-5 mt-2 list-decimal space-y-1">
          <li>Di Safari, ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.</li>
          <li>Buka ikon Bari Ramen, lalu isi formulir pendaftaran di sana.</li>
          <li>Setelah tiket muncul, ketuk Aktifkan notifikasi → Izinkan, lalu Uji notifikasi.</li>
        </ol>
        <p className="mt-3">Sudah punya ikon Bari Ramen? Buka ikon tersebut untuk mendaftar. Jika memilih melanjutkan di Safari, tetap pantau tiket di Safari selama menunggu.</p>
      </> : <>
        <p className="mt-3">Notifikasi iPhone tersedia melalui aplikasi dari Layar Utama. Jika belum pernah memasang Bari Ramen, simpan halaman tiket ini melalui Safari → Bagikan → Tambahkan ke Layar Utama, lalu buka ikon yang baru dibuat.</p>
        <p className="mt-3">Pastikan nomor tiket yang tampil sama sebelum mengaktifkan notifikasi. Jika tiket tidak muncul di aplikasi, lanjutkan memantau tiket di Safari dan minta bantuan staf. Jangan mendaftar ulang untuk antrean yang sama.</p>
        <p className="mt-3">Untuk kunjungan berikutnya, buka ikon Bari Ramen sebelum mendaftar.</p>
      </>}
      <p className="mt-3 text-xs leading-5 text-slate-500">Memerlukan iOS/iPadOS 16.4 atau lebih baru. Memasang ikon belum mengaktifkan notifikasi.</p>
    </> : <>
      <ol className="ml-5 mt-3 list-decimal space-y-1">
        <li>Di Chrome, ketuk menu ⋮ → Tambahkan ke Layar Utama atau Instal aplikasi.</li>
        <li>Buka ikon Bari Ramen menggunakan Chrome dan profil yang sama dengan saat mendaftar.</li>
        <li>Pastikan nomor tiket yang tampil sama. Jika belum muncul, kembali ke tab tiket semula dan minta bantuan staf.</li>
      </ol>
      <p className="mt-3 text-xs leading-5 text-slate-500">Jangan mendaftar ulang untuk antrean yang sama. Aktifkan dan uji notifikasi pada halaman tiket.</p>
    </>}
  </details>;
}
