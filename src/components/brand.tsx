import Link from "next/link";

export function Brand({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Bari Ramen beranda"
      className={`inline-block text-xl font-bold tracking-[-.04em] ${dark ? "text-white" : "text-ink"}`}
    >
      BARI-RAMEN
    </Link>
  );
}
