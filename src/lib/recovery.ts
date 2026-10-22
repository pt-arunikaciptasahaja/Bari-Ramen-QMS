import { demoEditHistory, restoreDemo } from './demo';
import { isDemo, supabase } from './supabase';
import { validRecoveryReason, type QueueEdit, type RecoveryReason } from './queue-edits';
import type { QueueEntry } from './queue';

export async function restoreQueue(entry: QueueEntry, reason: RecoveryReason, note: string, requestId: string): Promise<QueueEntry> {
  if (!validRecoveryReason(reason) || note.trim().length > 200 || !['called','seated','no-show'].includes(entry.status)) {
    throw new Error('Pilih alasan pemulihan dan isi catatan maksimal 200 karakter.');
  }
  if (isDemo) return restoreDemo(entry, reason, note.trim(), requestId);
  const { data, error } = await supabase().rpc('restore_queue', {
    p_id: entry.id, p_expected_status: entry.status, p_expected_edit_count: entry.edit_count ?? 0,
    p_reason: reason, p_note: note.trim(), p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
  return data as QueueEntry;
}
export async function queueEditHistory(id: string): Promise<QueueEdit[]> {
  if (isDemo) return demoEditHistory(id);
  const { data, error } = await supabase().rpc('queue_edit_history', { p_id: id });
  if (error) throw new Error('Riwayat perubahan belum dapat dimuat. Periksa koneksi dan coba lagi.');
  return (data ?? []) as QueueEdit[];
}
