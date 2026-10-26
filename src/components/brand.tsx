import Image from "next/image";
import Link from "next/link";

export function Brand({
  homeLabel = "Bari Ramen beranda",
  dark = false,
  size = "default",
  subtitle = "Antrean restoran",
}: {
  homeLabel?: string;
  dark?: boolean;
  size?: "default" | "large";
  subtitle?: string;
}) {
  return (
    <Link
      href="/"
      aria-label={homeLabel}
      className={`inline-flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand ${dark ? "text-white" : "text-ink"}`}
    >
      <span className={`brand-emblem ${size === "large" ? "brand-emblem-large" : ""}`}>
        <Image
          src="/brand/bari-ramen-logo.png"
          alt=""
          width={3375}
          height={3375}
          sizes={size === "large" ? "160px" : "112px"}
          className="brand-emblem-image"
        />
      </span>
      <span className="min-w-0">
        <span className={`block whitespace-nowrap font-bold tracking-[-.04em] ${size === "large" ? "text-xl lg:text-2xl" : "text-lg"}`}>BARI-RAMEN</span>
        <span className={`mt-0.5 block text-[10px] font-medium tracking-[.08em] sm:text-xs ${dark ? "text-white/70" : "text-slate-600"}`}><span lang="ja" className={dark ? "text-white/90" : "text-brand"}>バリラーメン</span><span aria-hidden="true"> · </span>{subtitle}</span>
      </span>
    </Link>
  );
}
