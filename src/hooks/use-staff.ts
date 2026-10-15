"use client";
import { useEffect, useState } from "react";
import { isDemo, supabase } from "@/lib/supabase";
export function useStaff() {
  const [ready, setReady] = useState(isDemo);
  const [allowed, setAllowed] = useState(isDemo);
  const [error, setError] = useState("");
  useEffect(() => {
    if (isDemo) return;
    let alive = true;
    let generation = 0;
    try {
      const db = supabase();
      async function check() {
        const attempt = ++generation;
        try {
          const session = await db.auth.getSession();
          if (session.error) throw session.error;
          let ok = false;
          if (session.data.session) {
            const role = await db.rpc("is_staff");
            if (role.error) throw role.error;
            ok = role.data === true;
          }
          if (alive && attempt === generation) {
            setAllowed(ok);
            setReady(true);
            setError("");
          }
        } catch (e) {
          if (alive && attempt === generation) {
            setReady(true);
            setAllowed(false);
            setError(
              e instanceof Error ? e.message : "Tidak dapat memeriksa akses.",
            );
          }
        }
      }
      void check();
      // Defer API work outside the auth callback to avoid an auth-lock deadlock.
      const { data } = db.auth.onAuthStateChange(() => {
        setTimeout(() => {
          if (alive) void check();
        }, 0);
      });
      return () => {
        alive = false;
        generation++;
        data.subscription.unsubscribe();
      };
    } catch (e) {
      setReady(true);
      setError(e instanceof Error ? e.message : "Konfigurasi tidak valid.");
    }
  }, []);
  return { ready, allowed, error };
}
