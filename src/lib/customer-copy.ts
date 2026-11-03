import type { QueueStatus } from './queue';

export const CALL_POLICY_COPY = 'Nomor antrian akan dipanggil sebanyak 3 kali, apabila panggilan ke-3 belum datang ke kasir, nomor antrian otomatis terlewati.';
export function customerStatusCopy(status: QueueStatus, expired = false) {
  if (expired) return 'Tiket ini sudah tidak berlaku. Silakan hubungi staf untuk pendaftaran antrean hari ini.';
  if (status === 'seated') return 'Meja Anda sudah dikonfirmasi. Selamat menikmati ramen di Bari Ramen.';
  if (status === 'no-show') return 'Nomor antrean Anda telah dilewati. Jika Anda sudah tiba, silakan temui staf di kasir agar kami dapat membantu.';
  if (status === 'called') return 'Silakan segera menuju kasir dan tunjukkan tiket ini kepada staf. Staf akan mengonfirmasi pemberian meja Anda.';
  return 'Terima kasih telah menunggu, mohon aktifkan notifikasi di HP Anda dan pantau tiket antrian secara berkala.';
}
