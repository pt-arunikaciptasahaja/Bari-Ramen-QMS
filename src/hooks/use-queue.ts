"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_EVENT, readDemo } from "@/lib/demo";
import { isDemo, supabase } from "@/lib/supabase";
import { serviceDate, type QueueEntry } from "@/lib/queue";
export function useQueue(staff = false, enabled = true) {
  const [rows, setRows] = useState<QueueEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState("Menghubungkan");
  const [error, setError] = useState("");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = ++request.current;
    try {
      let result: QueueEntry[];
      if (isDemo)
        result = readDemo().filter((r) => r.service_date === serviceDate());
      else {
        const response = await supabase()
          .from(staff ? "queue_entries" : "queue_board")
          .select("*")
          .eq("service_date", serviceDate())
          .order("created_at")
          .order("id")
          .limit(2000);
        if (response.error) throw response.error;
        result = response.data as QueueEntry[];
      }
      if (current === request.current) {
        setRows(result);
        setError("");
      }
    } catch (e) {
      if (current === request.current)
        setError(
          e instanceof Error ? e.message : "Tidak dapat memuat antrean.",
        );
    } finally {
      if (current === request.current) setLoading(false);
    }
  }, [enabled, staff]);
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let alive = true;
    const reload = () => {
      if (alive) void refresh();
    };
    reload();
    // Polling also reconciles missed events, reconnects and Jakarta midnight.
    const timer = setInterval(reload, 15000);
    window.addEventListener("focus", reload);
    window.addEventListener("online", reload);
    if (isDemo) {
      setConnection("Demo lokal");
      window.addEventListener("storage", reload);
      window.addEventListener(DEMO_EVENT, reload);
      return () => {
        alive = false;
        request.current++;
        clearInterval(timer);
        window.removeEventListener("focus", reload);
        window.removeEventListener("online", reload);
        window.removeEventListener("storage", reload);
        window.removeEventListener(DEMO_EVENT, reload);
      };
    }
    let db: ReturnType<typeof supabase> | undefined;
    let channel: ReturnType<ReturnType<typeof supabase>["channel"]> | undefined;
    try {
      db = supabase();
      channel = db
        .channel(`queue-${staff ? "staff" : "public"}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: staff ? "queue_entries" : "queue_board",
          },
          reload,
        )
        .subscribe((state) => {
          if (!alive) return;
          setConnection(
            state === "SUBSCRIBED" ? "Terhubung" : "Menghubungkan ulang",
          );
          if (state === "SUBSCRIBED") reload();
        });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Konfigurasi tidak valid.");
    }
    return () => {
      alive = false;
      request.current++;
      clearInterval(timer);
      window.removeEventListener("focus", reload);
      window.removeEventListener("online", reload);
      if (channel && db) void db.removeChannel(channel);
    };
  }, [enabled, staff, refresh]);
  return { rows, loading, error, connection, refresh };
}
