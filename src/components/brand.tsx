import Link from "next/link";
import { Soup } from "lucide-react";
export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Bari Ramen beranda"
      className="flex items-center gap-3"
    >
      <span
        className={`grid h-11 w-11 place-items-center rounded-xl ${dark ? "bg-white/10 text-[#f6b59c]" : "bg-brand text-white"}`}
      >
        <Soup size={27} strokeWidth={1.6} />
      </span>
      <span>
        <span
          className={`block text-lg font-extrabold tracking-[.14em] ${dark ? "text-white" : "text-ink"}`}
        >
          BARI RAMEN<span className="ml-1 text-brand">.</span>
        </span>
        <span
          className={`block text-[10px] font-semibold tracking-[.22em] ${dark ? "text-stone-400" : "text-stone-500"}`}
        >
          GOOD RAMEN. WORTH THE WAIT.
        </span>
      </span>
    </Link>
  );
}
