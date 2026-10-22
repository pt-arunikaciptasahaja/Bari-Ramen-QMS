import type { QueueStatus } from './queue';

export const CALL_POLICY_COPY = 'Nomor dipanggil maksimal 3 kali dengan jeda 5 menit. Jika meja belum diberikan dalam 15 menit sejak panggilan pertama, antrean otomatis dilewati.';
export function customerStatusCopy(status: QueueStatus, expired = false) {
  if (expired) return 'Tiket ini sudah tidak berlaku. Silakan hubungi staf untuk pendaftaran antrean hari ini.';
  if (status === 'seated') return 'Meja Anda sudah tersedia. Selamat menikmati hidangan di Bari Ramen.';
  if (status === 'no-show') return 'Nomor antrean Anda telah dilewati. Silakan hubungi staf untuk bantuan selanjutnya.';
  if (status === 'called') return 'Silakan segera menuju kasir dan tunjukkan tiket ini kepada staf. Staf akan mengonfirmasi pemberian meja Anda.';
  return 'Silakan menunggu di sekitar restoran. Aktifkan notifikasi dan pantau tiket Anda agar tidak melewatkan giliran.';
}
