import type { QueueStatus } from './queue';

export const recoveryReasons = {
  'late-arrival': 'Pelanggan datang terlambat',
  'staff-error': 'Salah klik oleh staf',
  operational: 'Penyesuaian operasional',
} as const;
export type RecoveryReason = keyof typeof recoveryReasons;
export type QueueEdit = {
  id: string; actor_id: string; created_at: string; from_status: QueueStatus;
  to_status: 'waiting'; reason: RecoveryReason; note: string; edit_number: number;
};
export function validRecoveryReason(value: string): value is RecoveryReason {
  return Object.hasOwn(recoveryReasons, value);
}
