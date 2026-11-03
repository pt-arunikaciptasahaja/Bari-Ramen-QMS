import Image from "next/image";
import Link from "next/link";

export function Brand({
  showJapanese = true,
  homeLabel = "Bari Ramen beranda",
  dark = false,
  size = "default",
  subtitle = "Antrean restoran",
}: {
  showJapanese?: boolean;
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
      <span className={`brand-emblem brand-emblem-updated ${size === "large" ? "brand-emblem-large" : ""}`}>
        <Image
          src="/brand/bari-ramen-logo-white.webp"
          alt=""
          width={512}
          height={512}
          sizes={size === "large" ? "160px" : "112px"}
          className="brand-emblem-image"
        />
      </span>
      <span className="min-w-0">
        <span className={`brand-wordmark block whitespace-nowrap font-bold tracking-[-.04em] ${size === "large" ? "text-xl lg:text-2xl" : "text-lg"}`}>BARI-RAMEN</span>
        {(showJapanese || subtitle) && <span className={`brand-subtitle mt-0.5 block text-[10px] font-medium tracking-[.08em] sm:text-xs ${dark ? "text-white/70" : "text-slate-600"}`}>{showJapanese && <span lang="ja" className={dark ? "text-white/90" : "text-brand"}>バリラーメン</span>}{showJapanese && subtitle && <span aria-hidden="true"> · </span>}{subtitle}</span>}
      </span>
    </Link>
  );
}
