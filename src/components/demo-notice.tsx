import { isDemo } from "@/lib/supabase";
export function DemoNotice() {
  return isDemo ? (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
      DEMO LOKAL · Data hanya tersinkron antar-tab browser ini, bukan
      antarperangkat. Gunakan nama fiktif.
    </div>
  ) : null;
}
