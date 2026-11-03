import { isDemo } from "@/lib/supabase";
export function DemoNotice({ language = "id" }: { language?: "id" | "en" }) {
  return isDemo ? (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">
      {language === "en" ? "Demo mode. Sample data stays in this browser. Please use fictional guest details." : "Mode demo lokal. Data hanya dibagikan antar-tab pada browser ini. Gunakan nama fiktif, bukan data tamu sebenarnya."}
    </div>
  ) : null;
}
