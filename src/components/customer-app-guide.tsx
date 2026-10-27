export function CustomerAppGuide() {
  return <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
    <summary className="cursor-pointer py-1 font-semibold text-slate-800">Simpan Bari Ramen di Layar Utama</summary>
    <h3 className="mt-3 font-semibold text-slate-800">Android · Google Chrome</h3>
    <ol className="ml-5 mt-2 list-decimal space-y-1">
      <li>Buka halaman ini di Chrome biasa, bukan mode Samaran atau browser di dalam WhatsApp/Instagram.</li>
      <li>Ketuk menu ⋮ → Tambahkan ke Layar Utama atau Instal aplikasi. Pada beberapa versi, pilih Instal dan buat pintasan → Instal.</li>
      <li>Ikuti petunjuk di layar, lalu buka ikon Bari Ramen. Gunakan Chrome dan profil yang sama dengan saat mendaftar.</li>
    </ol>
    <h3 className="mt-4 font-semibold text-slate-800">iPhone / iPad · Safari</h3>
    <ol className="ml-5 mt-2 list-decimal space-y-1">
      <li>Buka tautan tiket di Safari, lalu ketuk Bagikan → Tambahkan ke Layar Utama → Tambah.</li>
      <li>Buka ikon Bari Ramen. Jika tiket belum muncul, salin tautan tiket dari Safari dan hubungkan di aplikasi.</li>
    </ol>
    <p className="mt-3">Sudah daftar, tetapi tiket belum muncul dari ikon? Gunakan Salin tautan tiket di browser asal, lalu pilih Sudah daftar di Safari, Chrome, atau aplikasi? di halaman pendaftaran. Tidak perlu mengambil nomor lagi.</p>
    <p className="mt-3 text-xs leading-5 text-slate-500">Memasang ikon tidak membuat antrean baru atau langsung mengaktifkan notifikasi. Buka tiket dari ikon, lalu aktifkan dan uji notifikasi. Koneksi internet tetap diperlukan untuk melihat status terbaru.</p>
  </details>;
}
