import { createClient, type SupabaseClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isDemo = !url && !key;
let client: SupabaseClient | undefined;
export function supabase() {
  if (!url || !key)
    throw new Error(
      "Konfigurasi Supabase belum lengkap. Isi URL dan anon key.",
    );
  return (client ??= createClient(url, key));
}
let authPromise: Promise<void> | undefined;
export function ensureGuest() {
  if (!authPromise)
    authPromise = (async () => {
      const db = supabase();
      const { data, error } = await db.auth.getSession();
      if (error) throw error;
      if (!data.session) {
        const result = await db.auth.signInAnonymously();
        if (result.error)
          throw new Error(
            "Tidak dapat membuat sesi tamu. Periksa koneksi dan pengaturan Anonymous Sign-In.",
          );
      }
    })().finally(() => {
      authPromise = undefined;
    });
  return authPromise;
}
